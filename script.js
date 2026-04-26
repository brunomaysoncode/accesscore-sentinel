/*
  AccessCore Pro — Protótipo front-end de controle de acesso.
  Sem backend, sem dependências externas e com persistência local via localStorage.
  Importante: este projeto é demonstrativo; controle de acesso real exige backend, APIs,
  autenticação forte, criptografia, sessão segura e integração física validada.
*/

(() => {
  'use strict';

  const STORAGE_KEY = 'accesscore.pro.v1';
  const THEME_KEY = 'accesscore.theme';

  const modules = [
    ['dashboard', 'Dashboard', '⌂'],
    ['visitors', 'Visitantes', '◉'],
    ['companies', 'Empresas', '▣'],
    ['employees', 'Funcionários', '◆'],
    ['vehicles', 'Veículos', '▰'],
    ['codes', 'Códigos', '#'],
    ['collector', 'Coletor', '◌'],
    ['turnstiles', 'Catracas', '⇄'],
    ['terminals', 'Terminais', '▤'],
    ['networks', 'Redes', '◎'],
    ['permissions', 'Permissões', '☑'],
    ['movement', 'Entrada/Saída', '↕'],
    ['reports', 'Relatórios', '◧'],
    ['settings', 'Configurações', '⚙']
  ];

  const roleLabels = ['Administrador', 'Portaria', 'Segurança', 'RH', 'Visitante', 'Funcionário', 'Supervisor', 'Operador de coletor'];
  const permissionLabels = {
    dashboard: 'Ver dashboard',
    createVisitor: 'Cadastrar visitante',
    editVisitor: 'Editar visitante',
    deleteVisitor: 'Excluir visitante',
    releaseGate: 'Liberar catraca',
    blockAccess: 'Bloquear acesso',
    reports: 'Ver relatórios',
    manageEmployees: 'Gerenciar funcionários',
    manageTerminals: 'Gerenciar terminais',
    manageNetworks: 'Gerenciar redes'
  };

  let db = null;
  let currentView = 'dashboard';
  let globalSearch = '';
  let currentReportRows = [];
  let chartInstanceReady = false;

  const el = (id) => document.getElementById(id);
  const app = () => el('app');

  const nowISO = () => new Date().toISOString();
  const todayKey = () => new Date().toISOString().slice(0, 10);
  const uid = (prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const pad = (n) => String(n).padStart(2, '0');
  const fmtDate = (iso) => iso ? new Date(iso).toLocaleString('pt-BR') : '—';
  const dateInputValue = (iso) => iso ? new Date(iso).toISOString().slice(0, 16) : '';
  const addHours = (hours) => new Date(Date.now() + Number(hours || 8) * 3600000).toISOString();
  const escapeHTML = (value) => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[c]));
  const normalize = (value) => String(value ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  }

  function loadData() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      db = seedData();
      saveData();
      return;
    }
    try {
      db = JSON.parse(raw);
      db = migrate(db);
    } catch (error) {
      console.error(error);
      db = seedData();
      saveData();
      toast('Base reiniciada', 'Dados locais estavam corrompidos e foram recriados.', 'warning');
    }
  }

  function migrate(data) {
    const fresh = seedData(false);
    return {
      ...fresh,
      ...data,
      settings: { ...fresh.settings, ...(data.settings || {}) },
      permissions: { ...fresh.permissions, ...(data.permissions || {}) }
    };
  }

  function generateCode(type = 'AC') {
    let code;
    do {
      const blockA = Math.random().toString(36).slice(2, 5).toUpperCase();
      const blockB = Math.random().toString(36).slice(2, 6).toUpperCase();
      code = `${type.slice(0, 3).toUpperCase()}-${blockA}-${blockB}`;
    } while (db?.codes?.some(item => item.code === code));
    return code;
  }

  function initials(name) {
    return String(name || '?').split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
  }

  function seedData(includeHistory = true) {
    const settings = {
      companyName: 'Nexus Corporate Tower',
      terminalCount: 80,
      defaultCodeHours: 8,
      demoMode: true,
      activeNetworks: 5
    };

    const networks = [1, 2, 3, 4, 5].map(n => ({
      id: `net_${n}`,
      name: `Rede ${n}`,
      range: `10.10.${n}.0/24`,
      status: n === 4 ? 'instável' : 'online',
      observation: n === 4 ? 'Monitorar latência intermitente.' : 'Operação nominal.',
      turnstiles: [],
      terminals: []
    }));

    const turnstiles = [1, 2, 3].map(n => ({
      id: `cat_${n}`,
      name: `Catraca ${n}`,
      location: ['Recepção Principal', 'Portaria Lateral', 'Garagem B1'][n - 1],
      networkId: `net_${n}`,
      terminalId: `term_${pad(n)}`,
      status: n === 3 ? 'manutenção' : 'online',
      lastRelease: null,
      entries: 5 * n,
      exits: 3 * n,
      mode: n === 1 ? 'bidirecional' : (n === 2 ? 'entrada' : 'saída')
    }));

    const terminals = Array.from({ length: 80 }, (_, i) => {
      const n = i + 1;
      const net = `net_${((i % 5) + 1)}`;
      const status = i % 17 === 0 ? 'offline' : (i % 23 === 0 ? 'manutenção' : 'online');
      const type = ['recepção', 'portaria', 'coletor', 'catraca', 'totem'][i % 5];
      return {
        id: `term_${pad(n)}`,
        name: `Terminal ${pad(n)}`,
        local: ['Recepção', 'Portaria Norte', 'Garagem', 'Expedição', 'Torre B'][i % 5],
        networkId: net,
        ip: `10.10.${(i % 5) + 1}.${20 + n}`,
        turnstileId: n <= 3 ? `cat_${n}` : `cat_${(i % 3) + 1}`,
        status,
        lastCommunication: new Date(Date.now() - (i * 9 + 2) * 60000).toISOString(),
        type
      };
    });

    networks.forEach(net => {
      net.terminals = terminals.filter(t => t.networkId === net.id).map(t => t.id);
      net.turnstiles = turnstiles.filter(c => c.networkId === net.id).map(c => c.id);
    });

    const companies = [
      ['c_1', 'Aurora Tech', '42.100.300/0001-91', 'Marta Ribeiro', '(11) 94444-0101', 'marta@auroratech.demo', 'Av. Paulista, 1000', 'Fornecedor estratégico de software.', 'ativa'],
      ['c_2', 'BlueStone Facilities', '13.821.770/0001-44', 'Caio Mendes', '(11) 95555-0202', 'caio@bluestone.demo', 'Rua Faria Lima, 2440', 'Equipe terceirizada de manutenção.', 'ativa'],
      ['c_3', 'Orion Logistics', '70.450.900/0001-20', 'Lívia Rocha', '(21) 96666-0303', 'livia@orion.demo', 'Av. Brasil, 515', 'Entregas críticas.', 'ativa'],
      ['c_4', 'Particular', '—', 'Recepção', '(11) 90000-0000', 'recepcao@nexus.demo', 'N/A', 'Uso para visitantes sem empresa.', 'ativa'],
      ['c_5', 'Vértice Consultoria', '33.410.220/0001-18', 'Rafael Antunes', '(31) 97777-0404', 'rafael@vertice.demo', 'Rua Savassi, 72', 'Consultoria em processos.', 'suspensa']
    ].map(([id, name, document, responsible, phone, email, address, observation, status]) => ({ id, name, document, responsible, phone, email, address, observation, status }));

    const visitors = [
      ['v_1', 'Ana Carvalho', 'CPF', '123.456.789-10', 'Aurora Tech', '(11) 98888-1111', 'carro', 'HCK-2026', 'Marcos Silva', 'TI', 'Reunião de implantação', 'autorizado', 'cat_1', true],
      ['v_2', 'Bruno Lima', 'RG', '44.555.666-7', 'Particular', '(11) 98888-2222', '', '', 'Dra. Helena', 'Jurídico', 'Assinatura de documentos', 'pendente', 'cat_1', false],
      ['v_3', 'Clara Souza', 'CNH', 'CNH-987654321', 'BlueStone Facilities', '(11) 98888-3333', 'van', 'MNT-1A23', 'Operações', 'Facilities', 'Manutenção preventiva', 'autorizado', 'cat_2', false],
      ['v_4', 'Diego Martins', 'CPF', '987.654.321-00', 'Orion Logistics', '(21) 98888-4444', 'caminhão', 'LOG-7744', 'Expedição', 'Logística', 'Entrega de equipamentos', 'bloqueado', 'cat_2', false],
      ['v_5', 'Eva Nascimento', 'Passaporte', 'BR998877', 'Vértice Consultoria', '(31) 98888-5555', '', '', 'Diretoria', 'Executivo', 'Workshop estratégico', 'expirado', 'cat_3', false]
    ].map((row, index) => {
      const [id, name, docType, document, companyOrigin, phone, vehicle, plate, host, department, observation, status, turnstileId, inside] = row;
      const code = `VIS-DEMO-${index + 1}${index + 6}`;
      return { id, name, docType, document, companyOrigin, phone, vehicle, plate, host, department, observation, status, turnstileId, accessCode: code, validUntil: index === 4 ? addHours(-2) : addHours(8 + index), avatar: initials(name), createdAt: new Date(Date.now() - (index + 2) * 86400000).toISOString(), inside };
    });

    const employees = [
      ['e_1', 'Marcos Silva', 'MAT-001', '111.222.333-44', '(11) 97777-1111', 'marcos@nexus.demo', 'TI', 'Coordenador de Infra', 'Supervisor', ['cat_1', 'cat_2'], ['term_01', 'term_02'], 'ativo', true],
      ['e_2', 'Helena Duarte', 'MAT-002', '222.333.444-55', '(11) 97777-2222', 'helena@nexus.demo', 'Jurídico', 'Advogada', 'Funcionário', ['cat_1'], ['term_01'], 'ativo', false],
      ['e_3', 'Igor Valente', 'MAT-003', '333.444.555-66', '(11) 97777-3333', 'igor@nexus.demo', 'Segurança', 'Supervisor de Segurança', 'Segurança', ['cat_1', 'cat_2', 'cat_3'], ['term_01', 'term_02', 'term_03'], 'ativo', true],
      ['e_4', 'Patrícia Gomes', 'MAT-004', '444.555.666-77', '(11) 97777-4444', 'patricia@nexus.demo', 'RH', 'Analista RH', 'RH', ['cat_1'], ['term_04'], 'afastado', false],
      ['e_5', 'Ruan Teixeira', 'MAT-005', '555.666.777-88', '(11) 97777-5555', 'ruan@nexus.demo', 'Operações', 'Operador', 'Funcionário', ['cat_2'], ['term_02'], 'bloqueado', false]
    ].map((row, index) => {
      const [id, name, registration, document, phone, email, department, role, permissionLevel, turnstilesAllowed, terminalsAllowed, status, inside] = row;
      return { id, name, registration, document, phone, email, department, role, permissionLevel, turnstilesAllowed, terminalsAllowed, status, internalCode: `EMP-DEMO-${index + 1}${index + 3}`, createdAt: new Date(Date.now() - (index + 5) * 86400000).toISOString(), inside };
    });

    const vehicles = [
      ['veh_1', 'HCK-2026', 'Corolla', 'Preto', 'carro', 'Ana Carvalho', 'Aurora Tech', 'v_1', 'autorizado', 'Veículo de visitante.'],
      ['veh_2', 'MNT-1A23', 'Sprinter', 'Branca', 'van', 'Clara Souza', 'BlueStone Facilities', 'v_3', 'autorizado', 'Equipe técnica.'],
      ['veh_3', 'LOG-7744', 'Volvo VM', 'Azul', 'caminhão', 'Diego Martins', 'Orion Logistics', 'v_4', 'bloqueado', 'Documento da carga pendente.'],
      ['veh_4', 'NXS-0001', 'Civic', 'Prata', 'carro', 'Marcos Silva', 'Nexus Corporate Tower', 'e_1', 'autorizado', 'Funcionário.'],
      ['veh_5', 'SEC-7B90', 'Factor', 'Vermelha', 'moto', 'Igor Valente', 'Nexus Corporate Tower', 'e_3', 'pendente', 'Aguardando renovação.']
    ].map(([id, plate, model, color, type, owner, company, associatedId, status, observation]) => ({ id, plate, model, color, type, owner, company, associatedId, status, observation, inside: false }));

    const codes = [
      ...visitors.map(v => ({ id: `code_${v.id}`, code: v.accessCode, type: 'visitante', ownerId: v.id, ownerName: v.name, turnstiles: [v.turnstileId], terminalId: 'term_01', validUntil: v.validUntil, status: v.status === 'bloqueado' ? 'bloqueado' : (v.status === 'expirado' ? 'expirado' : 'ativo'), generatedAt: v.createdAt, lastUse: null })),
      ...employees.map(e => ({ id: `code_${e.id}`, code: e.internalCode, type: 'funcionário', ownerId: e.id, ownerName: e.name, turnstiles: e.turnstilesAllowed, terminalId: e.terminalsAllowed[0] || 'term_01', validUntil: addHours(24 * 365), status: e.status === 'bloqueado' ? 'bloqueado' : 'ativo', generatedAt: e.createdAt, lastUse: null }))
    ];

    const permissions = {};
    roleLabels.forEach(role => {
      permissions[role] = {};
      Object.keys(permissionLabels).forEach(key => {
        permissions[role][key] = role === 'Administrador' ||
          (role === 'Portaria' && ['dashboard', 'createVisitor', 'editVisitor', 'releaseGate'].includes(key)) ||
          (role === 'Segurança' && ['dashboard', 'releaseGate', 'blockAccess', 'reports'].includes(key)) ||
          (role === 'RH' && ['dashboard', 'manageEmployees', 'reports'].includes(key)) ||
          (role === 'Supervisor' && ['dashboard', 'releaseGate', 'reports', 'blockAccess'].includes(key)) ||
          (role === 'Operador de coletor' && ['dashboard', 'releaseGate'].includes(key));
      });
    });

    const data = { settings, visitors, companies, employees, vehicles, codes, turnstiles, terminals, networks, permissions, history: [] };

    if (includeHistory) {
      const people = [...visitors.map(v => ['visitante', v]), ...employees.map(e => ['funcionário', e]), ...vehicles.map(v => ['veículo', v])];
      for (let i = 0; i < 20; i++) {
        const [type, person] = people[i % people.length];
        const turnstile = turnstiles[i % turnstiles.length];
        const terminal = terminals[i % terminals.length];
        const denied = i % 7 === 0;
        data.history.push({
          id: uid('hist'),
          personName: person.name || person.owner || person.plate,
          personType: type,
          document: person.document || person.plate || '—',
          code: person.accessCode || person.internalCode || 'VEH-DEMO',
          timestamp: new Date(Date.now() - (i * 58 + 10) * 60000).toISOString(),
          direction: i % 2 === 0 ? 'entrada' : 'saída',
          turnstileId: turnstile.id,
          turnstileName: turnstile.name,
          terminalId: terminal.id,
          terminalName: terminal.name,
          networkId: terminal.networkId,
          networkName: `Rede ${terminal.networkId.split('_')[1]}`,
          result: denied ? 'negado' : 'liberado',
          reason: denied ? 'Permissão insuficiente' : 'Fluxo demonstrativo',
          operator: ['Portaria 01', 'Segurança', 'Sistema'][i % 3],
          observation: denied ? 'Tentativa registrada para auditoria.' : 'Evento automático demo.'
        });
      }
    }

    return data;
  }

  function init() {
    loadData();
    applyTheme(localStorage.getItem(THEME_KEY) || 'light');
    renderNav();
    bindShell();
    routeTo(location.hash.replace('#', '') || 'dashboard');
  }

  function bindShell() {
    el('themeBtn').addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      localStorage.setItem(THEME_KEY, next);
      toast('Tema atualizado', `Modo ${next === 'dark' ? 'escuro' : 'claro'} ativado.`, 'success');
    });
    el('globalSearch').addEventListener('input', (event) => {
      globalSearch = event.target.value.trim();
      render();
    });
    el('menuBtn').addEventListener('click', () => el('sidebar').classList.toggle('open'));
    el('modalBackdrop').addEventListener('click', (event) => {
      if (event.target.id === 'modalBackdrop') closeModal();
    });
    window.addEventListener('hashchange', () => routeTo(location.hash.replace('#', '') || 'dashboard'));
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
  }

  function renderNav() {
    el('nav').innerHTML = modules.map(([key, label, icon]) => `
      <button class="nav-btn" data-route="${key}">
        <span class="nav-icon">${icon}</span><span>${label}</span>
      </button>
    `).join('');
    el('nav').addEventListener('click', (event) => {
      const btn = event.target.closest('[data-route]');
      if (!btn) return;
      location.hash = btn.dataset.route;
      el('sidebar').classList.remove('open');
    });
  }

  function routeTo(route) {
    currentView = modules.some(([key]) => key === route) ? route : 'dashboard';
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.route === currentView));
    el('pageTitle').textContent = modules.find(([key]) => key === currentView)?.[1] || 'Dashboard';
    render();
  }

  function render() {
    const viewMap = {
      dashboard: renderDashboard,
      visitors: renderVisitors,
      companies: renderCompanies,
      employees: renderEmployees,
      vehicles: renderVehicles,
      codes: renderCodes,
      collector: renderCollector,
      turnstiles: renderTurnstiles,
      terminals: renderTerminals,
      networks: renderNetworks,
      permissions: renderPermissions,
      movement: renderMovement,
      reports: renderReports,
      settings: renderSettings
    };
    app().innerHTML = globalSearch ? renderGlobalSearch() : '';
    app().insertAdjacentHTML('beforeend', viewMap[currentView]());
    bindViewEvents(currentView);
    if (currentView === 'dashboard') drawAccessChart();
  }

  function renderGlobalSearch() {
    const q = normalize(globalSearch);
    const rows = [];
    const push = (type, title, detail, action) => rows.push({ type, title, detail, action });

    db.visitors.filter(v => searchable(v).includes(q)).slice(0, 8).forEach(v => push('Visitante', v.name, `${v.document} • ${v.companyOrigin} • ${v.accessCode}`, `openVisitor:${v.id}`));
    db.employees.filter(e => searchable(e).includes(q)).slice(0, 8).forEach(e => push('Funcionário', e.name, `${e.registration} • ${e.department} • ${e.internalCode}`, `openEmployee:${e.id}`));
    db.vehicles.filter(v => searchable(v).includes(q)).slice(0, 8).forEach(v => push('Veículo', v.plate, `${v.model} • ${v.owner} • ${v.status}`, `openVehicle:${v.id}`));
    db.companies.filter(c => searchable(c).includes(q)).slice(0, 8).forEach(c => push('Empresa', c.name, `${c.document} • ${c.responsible}`, `openCompany:${c.id}`));
    db.codes.filter(c => searchable(c).includes(q)).slice(0, 8).forEach(c => push('Código', c.code, `${c.ownerName} • ${c.status}`, `copy:${c.code}`));

    return `
      <section class="panel">
        <div class="section-head">
          <div><h2>Busca global</h2><p>${rows.length ? `${rows.length} resultado(s) rápidos para “${escapeHTML(globalSearch)}”.` : `Nada encontrado para “${escapeHTML(globalSearch)}”.`}</p></div>
          <button class="ghost-btn" data-clear-search>Limpar busca</button>
        </div>
        ${rows.length ? `<div class="table-wrap"><table><thead><tr><th>Tipo</th><th>Registro</th><th>Detalhe</th><th>Ação</th></tr></thead><tbody>${rows.map(r => `
          <tr><td>${r.type}</td><td><strong>${escapeHTML(r.title)}</strong></td><td>${escapeHTML(r.detail)}</td><td><button class="ghost-btn small-btn" data-search-action="${escapeHTML(r.action)}">Abrir</button></td></tr>`).join('')}</tbody></table></div>` : emptyState('Nenhum registro combina com a busca.', '⌕')}
      </section>`;
  }

  function searchable(obj) {
    return normalize(Object.values(obj).flat().join(' '));
  }

  function bindViewEvents(view) {
    document.querySelectorAll('[data-clear-search]').forEach(btn => btn.addEventListener('click', () => {
      globalSearch = '';
      el('globalSearch').value = '';
      render();
    }));
    document.querySelectorAll('[data-search-action]').forEach(btn => btn.addEventListener('click', () => handleSearchAction(btn.dataset.searchAction)));

    if (view === 'dashboard') bindDashboard();
    if (view === 'visitors') bindEntityModule('visitors');
    if (view === 'companies') bindEntityModule('companies');
    if (view === 'employees') bindEntityModule('employees');
    if (view === 'vehicles') bindEntityModule('vehicles');
    if (view === 'codes') bindCodes();
    if (view === 'collector') bindCollector();
    if (view === 'turnstiles') bindTurnstiles();
    if (view === 'terminals') bindTerminals();
    if (view === 'networks') bindNetworks();
    if (view === 'permissions') bindPermissions();
    if (view === 'movement') bindMovement();
    if (view === 'reports') bindReports();
    if (view === 'settings') bindSettings();
  }

  function handleSearchAction(action) {
    const [kind, value] = action.split(':');
    if (kind === 'copy') return copyToClipboard(value);
    const map = { openVisitor: ['visitors', value], openEmployee: ['employees', value], openVehicle: ['vehicles', value], openCompany: ['companies', value] };
    if (map[kind]) {
      location.hash = map[kind][0];
      setTimeout(() => openEntityModal(map[kind][0], map[kind][1]), 80);
    }
  }

  function statusBadge(status) {
    const s = normalize(status);
    const cls = s.includes('online') || s.includes('ativo') || s.includes('ativa') || s.includes('autorizado') || s.includes('liberado') ? 'success'
      : s.includes('pendente') || s.includes('manutencao') || s.includes('manutenção') || s.includes('instavel') || s.includes('instável') || s.includes('afastado') ? 'warning'
      : s.includes('offline') || s.includes('bloque') || s.includes('negado') || s.includes('desligado') || s.includes('expirado') || s.includes('suspensa') ? 'danger'
      : 'muted';
    return `<span class="badge badge-${cls}">${escapeHTML(status)}</span>`;
  }

  function emptyState(text, icon = '□') {
    return `<div class="empty-state"><div class="empty-icon">${icon}</div><strong>${escapeHTML(text)}</strong><p>Use os botões de ação para criar ou filtrar registros.</p></div>`;
  }

  function renderDashboard() {
    const today = todayKey();
    const historyToday = db.history.filter(h => h.timestamp?.startsWith(today));
    const entriesToday = historyToday.filter(h => h.direction === 'entrada' && h.result === 'liberado').length;
    const exitsToday = historyToday.filter(h => h.direction === 'saída' && h.result === 'liberado').length;
    const insideVisitors = db.visitors.filter(v => v.inside).length;
    const employeesActive = db.employees.filter(e => e.status === 'ativo').length;
    const vehiclesTotal = db.vehicles.length;
    const turnstilesOnline = db.turnstiles.filter(c => c.status === 'online').length;
    const terminalsOnline = db.terminals.filter(t => t.status === 'online').length;
    const denied = db.history.filter(h => h.result === 'negado').slice(0, 5);

    return `
      <section class="demo-note">
        <strong>Modo Demonstração ativo</strong>
        <p>Este protótipo roda 100% no navegador e simula controle de acesso. Integrações reais com catracas, biometria, banco de dados e autenticação segura exigem backend, API, criptografia, sessão e infraestrutura dedicada.</p>
      </section>

      <section class="grid metric-grid">
        ${metric('Visitantes cadastrados', db.visitors.length, 'Base local', '◉')}
        ${metric('Dentro agora', insideVisitors, 'Visitantes com entrada sem saída', '↧')}
        ${metric('Entradas do dia', entriesToday, 'Eventos liberados hoje', '↑')}
        ${metric('Saídas do dia', exitsToday, 'Eventos liberados hoje', '↓')}
        ${metric('Funcionários ativos', employeesActive, 'Prontos para acesso', '◆')}
        ${metric('Veículos cadastrados', vehiclesTotal, 'Com status auditável', '▰')}
        ${metric('Catracas online', `${turnstilesOnline}/${db.turnstiles.length}`, 'Estado operacional', '⇄')}
        ${metric('Terminais ativos', `${terminalsOnline}/80`, 'Comunicação simulada', '▤')}
      </section>

      <section class="grid grid-2">
        <div class="panel">
          <div class="section-head"><div><h2>Fluxo de acessos</h2><p>Entradas, saídas e negativas por hora simulada.</p></div><button class="ghost-btn" data-refresh-chart>Atualizar</button></div>
          <div class="chart-box"><canvas id="accessChart" width="900" height="320"></canvas></div>
        </div>
        <div class="panel">
          <div class="section-head"><div><h2>Alertas recentes</h2><p>Permissão negada, expiração, bloqueio ou inconsistência.</p></div><button class="ghost-btn" data-route-btn="movement">Ver histórico</button></div>
          <div class="grid">
            ${denied.length ? denied.map(h => `<div class="soft-alert"><span>${h.reason === 'Permissão insuficiente' ? '⛔' : '⚠'}</span><div><strong>${escapeHTML(h.personName)}</strong><p>${escapeHTML(h.reason)} • ${fmtDate(h.timestamp)}</p></div></div>`).join('') : emptyState('Nenhum alerta crítico no momento.', '✓')}
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="section-head"><div><h2>Últimos acessos</h2><p>Auditoria operacional de entrada e saída.</p></div><div class="action-row"><button class="primary-btn" data-route-btn="collector">Abrir coletor</button><button class="ghost-btn" data-export-history-json>Exportar JSON</button></div></div>
        ${historyTable(db.history.slice(0, 8))}
      </section>`;
  }

  function metric(label, value, note, icon) {
    return `<div class="metric-card"><div class="metric-top"><p class="metric-label">${escapeHTML(label)}</p><div class="metric-icon">${icon}</div></div><div class="metric-value">${escapeHTML(value)}</div><p class="metric-note">${escapeHTML(note)}</p></div>`;
  }

  function bindDashboard() {
    document.querySelectorAll('[data-route-btn]').forEach(btn => btn.addEventListener('click', () => location.hash = btn.dataset.routeBtn));
    document.querySelectorAll('[data-refresh-chart]').forEach(btn => btn.addEventListener('click', drawAccessChart));
    document.querySelectorAll('[data-export-history-json]').forEach(btn => btn.addEventListener('click', () => exportJSON('historico-accesscore.json', db.history)));
  }

  function drawAccessChart() {
    const canvas = el('accessChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const hours = Array.from({ length: 12 }, (_, i) => `${pad(8 + i)}h`);
    const entries = hours.map((_, i) => db.history.filter((h, index) => h.result === 'liberado' && h.direction === 'entrada' && index % 12 === i).length + Math.floor(Math.random() * 2));
    const exits = hours.map((_, i) => db.history.filter((h, index) => h.result === 'liberado' && h.direction === 'saída' && index % 12 === i).length + Math.floor(Math.random() * 2));
    const denied = hours.map((_, i) => db.history.filter((h, index) => h.result === 'negado' && index % 12 === i).length);
    const max = Math.max(4, ...entries, ...exits, ...denied);
    const colors = getChartColors();

    ctx.font = '13px system-ui';
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    for (let y = 40; y <= h - 45; y += 45) {
      ctx.beginPath(); ctx.moveTo(42, y); ctx.lineTo(w - 18, y); ctx.stroke();
    }

    const barW = (w - 90) / hours.length;
    hours.forEach((hour, i) => {
      const x = 52 + i * barW;
      const base = h - 48;
      const eH = entries[i] / max * 175;
      const sH = exits[i] / max * 175;
      const dH = denied[i] / max * 175;
      roundedBar(ctx, x, base - eH, 10, eH, colors.primary);
      roundedBar(ctx, x + 13, base - sH, 10, sH, colors.success);
      roundedBar(ctx, x + 26, base - dH, 10, dH, colors.danger);
      ctx.fillStyle = colors.muted;
      ctx.fillText(hour, x - 2, h - 18);
    });
    drawLegend(ctx, 52, 24, [['Entradas', colors.primary], ['Saídas', colors.success], ['Negados', colors.danger]]);
    chartInstanceReady = true;
  }

  function getChartColors() {
    const dark = document.documentElement.dataset.theme === 'dark';
    return {
      primary: dark ? '#60a5fa' : '#2563eb',
      success: dark ? '#22c55e' : '#16a34a',
      danger: dark ? '#f87171' : '#dc2626',
      grid: dark ? 'rgba(148,163,184,.18)' : '#e5e7eb',
      muted: dark ? '#9ca3af' : '#667085'
    };
  }

  function roundedBar(ctx, x, y, width, height, color) {
    ctx.fillStyle = color;
    const r = 5;
    const safeH = Math.max(2, height);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + safeH, r);
    ctx.arcTo(x + width, y + safeH, x, y + safeH, r);
    ctx.arcTo(x, y + safeH, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.fill();
  }

  function drawLegend(ctx, x, y, items) {
    items.forEach(([label, color], i) => {
      ctx.fillStyle = color; ctx.fillRect(x + i * 120, y - 10, 12, 12);
      ctx.fillStyle = getChartColors().muted; ctx.fillText(label, x + 18 + i * 120, y);
    });
  }

  const entityConfigs = {
    visitors: {
      key: 'visitors', singular: 'visitante', title: 'Visitantes', icon: '◉',
      searchPlaceholder: 'Buscar por nome, documento, empresa ou código',
      filterField: 'status', filterOptions: ['todos', 'autorizado', 'pendente', 'bloqueado', 'expirado'],
      columns: ['Visitante', 'Documento', 'Empresa', 'Código', 'Status', 'Dentro', 'Ações'],
      fields: () => [
        ['name', 'Nome do visitante', 'text', true], ['document', 'Documento', 'text', true], ['docType', 'Tipo de documento', 'select', true, ['CPF', 'RG', 'CNH', 'Passaporte', 'Outro']],
        ['companyOrigin', 'Empresa de origem', 'text', false], ['phone', 'Telefone', 'tel', false], ['vehicle', 'Veículo', 'text', false], ['plate', 'Placa do veículo', 'text', false],
        ['host', 'Pessoa visitada', 'text', true], ['department', 'Departamento visitado', 'text', false], ['turnstileId', 'Permissão de catraca', 'select', true, db.turnstiles.map(c => [c.id, c.name])],
        ['validUntil', 'Validade do acesso', 'datetime-local', true], ['status', 'Status', 'select', true, ['autorizado', 'pendente', 'bloqueado', 'expirado']], ['observation', 'Observação', 'textarea', false]
      ],
      defaults: () => ({ id: uid('v'), docType: 'CPF', companyOrigin: 'Particular', status: 'autorizado', turnstileId: 'cat_1', validUntil: addHours(db.settings.defaultCodeHours), createdAt: nowISO(), inside: false }),
      beforeSave: (item, isNew) => {
        item.avatar = initials(item.name);
        if (!item.accessCode) item.accessCode = generateCode('VIS');
        item.validUntil = item.validUntil ? new Date(item.validUntil).toISOString() : addHours(db.settings.defaultCodeHours);
        item.plate = String(item.plate || '').toUpperCase();
        if (isNew) db.codes.push(codeFromOwner(item, 'visitante'));
        syncCodeFromOwner(item, 'visitante');
      },
      validate: (item, isNew) => {
        const duplicate = db.visitors.some(v => v.document === item.document && v.id !== item.id);
        return duplicate ? 'Já existe visitante com este documento.' : null;
      },
      row: (v) => `
        <tr><td><div class="identity"><div class="avatar">${escapeHTML(v.avatar || initials(v.name))}</div><div><strong>${escapeHTML(v.name)}</strong><span class="sub">Visita: ${escapeHTML(v.host || '—')} • ${escapeHTML(v.department || '—')}</span></div></div></td>
        <td>${escapeHTML(v.docType)}<span class="sub">${escapeHTML(v.document)}</span></td><td>${escapeHTML(v.companyOrigin || 'Particular')}<span class="sub">${escapeHTML(v.phone || '—')}</span></td>
        <td>${codePill(v.accessCode)}</td><td>${statusBadge(v.status)}</td><td>${v.inside ? statusBadge('dentro') : statusBadge('fora')}</td><td>${entityActions('visitors', v.id, v.status)}</td></tr>`
    },
    companies: {
      key: 'companies', singular: 'empresa', title: 'Empresas', icon: '▣', searchPlaceholder: 'Buscar por nome, CNPJ, responsável ou e-mail', filterField: 'status', filterOptions: ['todos', 'ativa', 'suspensa', 'bloqueada'],
      columns: ['Empresa', 'Documento', 'Responsável', 'Contato', 'Status', 'Visitantes', 'Ações'],
      fields: () => [['name', 'Nome da empresa', 'text', true], ['document', 'CNPJ ou documento', 'text', true], ['responsible', 'Responsável', 'text', false], ['phone', 'Telefone', 'tel', false], ['email', 'E-mail', 'email', false], ['address', 'Endereço', 'text', false], ['status', 'Status', 'select', true, ['ativa', 'suspensa', 'bloqueada']], ['observation', 'Observações', 'textarea', false]],
      defaults: () => ({ id: uid('c'), status: 'ativa' }),
      validate: (item) => db.companies.some(c => c.document === item.document && c.id !== item.id) ? 'Já existe empresa com este documento.' : null,
      row: (c) => `<tr><td><strong>${escapeHTML(c.name)}</strong><span class="sub">${escapeHTML(c.address || '—')}</span></td><td>${escapeHTML(c.document)}</td><td>${escapeHTML(c.responsible || '—')}</td><td>${escapeHTML(c.phone || '—')}<span class="sub">${escapeHTML(c.email || '—')}</span></td><td>${statusBadge(c.status)}</td><td>${db.visitors.filter(v => normalize(v.companyOrigin) === normalize(c.name)).length}</td><td>${entityActions('companies', c.id)}</td></tr>`
    },
    employees: {
      key: 'employees', singular: 'funcionário', title: 'Funcionários', icon: '◆', searchPlaceholder: 'Buscar por nome, matrícula, documento, setor ou código', filterField: 'status', filterOptions: ['todos', 'ativo', 'afastado', 'bloqueado', 'desligado'],
      columns: ['Funcionário', 'Matrícula', 'Departamento', 'Permissão', 'Código', 'Status', 'Ações'],
      fields: () => [['name', 'Nome', 'text', true], ['registration', 'Matrícula', 'text', true], ['document', 'Documento', 'text', true], ['phone', 'Telefone', 'tel', false], ['email', 'E-mail', 'email', false], ['department', 'Departamento', 'text', true], ['role', 'Cargo', 'text', false], ['permissionLevel', 'Nível de permissão', 'select', true, roleLabels], ['turnstilesAllowed', 'Catracas permitidas', 'multiselect', true, db.turnstiles.map(c => [c.id, c.name])], ['terminalsAllowed', 'Terminais permitidos', 'multiselect', false, db.terminals.slice(0, 12).map(t => [t.id, t.name])], ['status', 'Status', 'select', true, ['ativo', 'afastado', 'bloqueado', 'desligado']]],
      defaults: () => ({ id: uid('e'), permissionLevel: 'Funcionário', status: 'ativo', turnstilesAllowed: ['cat_1'], terminalsAllowed: ['term_01'], createdAt: nowISO(), inside: false }),
      beforeSave: (item, isNew) => {
        if (!Array.isArray(item.turnstilesAllowed)) item.turnstilesAllowed = String(item.turnstilesAllowed || '').split(',').filter(Boolean);
        if (!Array.isArray(item.terminalsAllowed)) item.terminalsAllowed = String(item.terminalsAllowed || '').split(',').filter(Boolean);
        if (!item.internalCode) item.internalCode = generateCode('EMP');
        if (isNew) db.codes.push(codeFromOwner(item, 'funcionário'));
        syncCodeFromOwner(item, 'funcionário');
      },
      validate: (item) => db.employees.some(e => (e.document === item.document || e.registration === item.registration) && e.id !== item.id) ? 'Documento ou matrícula já cadastrado.' : null,
      row: (e) => `<tr><td><div class="identity"><div class="avatar">${escapeHTML(initials(e.name))}</div><div><strong>${escapeHTML(e.name)}</strong><span class="sub">${escapeHTML(e.email || '—')}</span></div></div></td><td>${escapeHTML(e.registration)}<span class="sub">${escapeHTML(e.document)}</span></td><td>${escapeHTML(e.department)}<span class="sub">${escapeHTML(e.role || '—')}</span></td><td>${escapeHTML(e.permissionLevel)}</td><td>${codePill(e.internalCode)}</td><td>${statusBadge(e.status)}</td><td>${entityActions('employees', e.id, e.status)}</td></tr>`
    },
    vehicles: {
      key: 'vehicles', singular: 'veículo', title: 'Veículos', icon: '▰', searchPlaceholder: 'Buscar por placa, modelo, proprietário ou empresa', filterField: 'status', filterOptions: ['todos', 'autorizado', 'pendente', 'bloqueado'],
      columns: ['Placa', 'Modelo', 'Tipo', 'Proprietário', 'Empresa', 'Status', 'Ações'],
      fields: () => [['plate', 'Placa', 'text', true], ['model', 'Modelo', 'text', true], ['color', 'Cor', 'text', false], ['type', 'Tipo', 'select', true, ['carro', 'moto', 'caminhão', 'van', 'outro']], ['owner', 'Proprietário', 'text', true], ['company', 'Empresa', 'text', false], ['associatedId', 'Visitante ou funcionário associado', 'text', false], ['status', 'Status', 'select', true, ['autorizado', 'pendente', 'bloqueado']], ['observation', 'Observação', 'textarea', false]],
      defaults: () => ({ id: uid('veh'), status: 'autorizado', inside: false }),
      beforeSave: (item) => { item.plate = String(item.plate || '').toUpperCase(); },
      validate: (item) => db.vehicles.some(v => normalize(v.plate) === normalize(item.plate) && v.id !== item.id) ? 'Já existe veículo com esta placa.' : null,
      row: (v) => `<tr><td><strong>${escapeHTML(v.plate)}</strong><span class="sub">${v.inside ? 'Dentro da empresa' : 'Fora'}</span></td><td>${escapeHTML(v.model)}<span class="sub">${escapeHTML(v.color || '—')}</span></td><td>${escapeHTML(v.type)}</td><td>${escapeHTML(v.owner)}</td><td>${escapeHTML(v.company || '—')}</td><td>${statusBadge(v.status)}</td><td>${entityActions('vehicles', v.id, v.status)}</td></tr>`
    }
  };

  function codeFromOwner(item, type) {
    const isEmployee = type === 'funcionário';
    return {
      id: uid('code'),
      code: isEmployee ? item.internalCode : item.accessCode,
      type,
      ownerId: item.id,
      ownerName: item.name,
      turnstiles: isEmployee ? item.turnstilesAllowed : [item.turnstileId],
      terminalId: isEmployee ? (item.terminalsAllowed?.[0] || 'term_01') : 'term_01',
      validUntil: isEmployee ? addHours(24 * 365) : item.validUntil,
      status: ['bloqueado', 'expirado'].includes(item.status) ? item.status : 'ativo',
      generatedAt: item.createdAt || nowISO(),
      lastUse: null
    };
  }

  function syncCodeFromOwner(item, type) {
    const code = db.codes.find(c => c.ownerId === item.id && c.type === type);
    if (!code) return;
    const fresh = codeFromOwner(item, type);
    Object.assign(code, { ...fresh, id: code.id, generatedAt: code.generatedAt, lastUse: code.lastUse });
  }

  function entityActions(module, id, status = '') {
    const extra = module === 'visitors' ? `<button class="success-btn small-btn" data-action="checkin" data-id="${id}">Entrada</button><button class="ghost-btn small-btn" data-action="checkout" data-id="${id}">Saída</button>`
      : module === 'employees' ? `<button class="success-btn small-btn" data-action="checkin" data-id="${id}">Entrada</button><button class="ghost-btn small-btn" data-action="checkout" data-id="${id}">Saída</button>${status === 'bloqueado' ? `<button class="warning-btn small-btn" data-action="unblock" data-id="${id}">Liberar</button>` : `<button class="danger-btn small-btn" data-action="block" data-id="${id}">Bloquear</button>`}`
      : module === 'vehicles' ? `<button class="success-btn small-btn" data-action="vehicleIn" data-id="${id}">Entrada</button><button class="ghost-btn small-btn" data-action="vehicleOut" data-id="${id}">Saída</button>` : '';
    return `<div class="btn-group"><button class="ghost-btn small-btn" data-action="edit" data-id="${id}">Editar</button>${extra}<button class="danger-btn small-btn" data-action="delete" data-id="${id}">Excluir</button></div>`;
  }

  function codePill(code) {
    return `<span class="code-pill"><span>${escapeHTML(code || '—')}</span><button class="ghost-btn small-btn" data-copy="${escapeHTML(code || '')}" title="Copiar código">Copiar</button></span>`;
  }

  function renderEntityModule(moduleKey) {
    const cfg = entityConfigs[moduleKey];
    const list = filteredEntityList(cfg);
    return `
      <section class="panel">
        <div class="section-head">
          <div><h2>${cfg.title}</h2><p>Cadastro, busca, filtros e operações simuladas de ${cfg.singular}.</p></div>
          <div class="action-row"><button class="primary-btn" data-new-entity="${moduleKey}">+ Novo ${cfg.singular}</button><button class="ghost-btn" data-export-entity="csv">CSV</button><button class="ghost-btn" data-export-entity="json">JSON</button></div>
        </div>
        <div class="filters">
          <input class="input" data-entity-search placeholder="${cfg.searchPlaceholder}" />
          <select class="select" data-entity-filter>${cfg.filterOptions.map(opt => `<option value="${opt}">${opt[0].toUpperCase() + opt.slice(1)}</option>`).join('')}</select>
          <select class="select" data-sort><option value="name">Ordenar por nome</option><option value="status">Ordenar por status</option><option value="createdAt">Mais recentes</option></select>
          <button class="ghost-btn" data-clear-filters>Limpar filtros</button>
        </div>
        ${list.length ? entityTable(cfg, list) : emptyState(`Nenhum ${cfg.singular} encontrado.`, cfg.icon)}
      </section>`;
  }

  function filteredEntityList(cfg) {
    let list = [...db[cfg.key]];
    const q = normalize(sessionStorage.getItem(`${cfg.key}.q`) || '');
    const filter = sessionStorage.getItem(`${cfg.key}.filter`) || 'todos';
    const sort = sessionStorage.getItem(`${cfg.key}.sort`) || 'name';
    if (q) list = list.filter(item => searchable(item).includes(q));
    if (filter !== 'todos') list = list.filter(item => normalize(item[cfg.filterField]) === normalize(filter));
    list.sort((a, b) => String(a[sort] || '').localeCompare(String(b[sort] || '')));
    if (sort === 'createdAt') list.reverse();
    return list;
  }

  function entityTable(cfg, list) {
    return `<div class="table-wrap"><table><thead><tr>${cfg.columns.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${list.map(cfg.row).join('')}</tbody></table></div>`;
  }

  function bindEntityModule(moduleKey) {
    const cfg = entityConfigs[moduleKey];
    const qInput = document.querySelector('[data-entity-search]');
    const fInput = document.querySelector('[data-entity-filter]');
    const sInput = document.querySelector('[data-sort]');
    if (qInput) qInput.value = sessionStorage.getItem(`${cfg.key}.q`) || '';
    if (fInput) fInput.value = sessionStorage.getItem(`${cfg.key}.filter`) || 'todos';
    if (sInput) sInput.value = sessionStorage.getItem(`${cfg.key}.sort`) || 'name';

    qInput?.addEventListener('input', e => { sessionStorage.setItem(`${cfg.key}.q`, e.target.value); render(); });
    fInput?.addEventListener('change', e => { sessionStorage.setItem(`${cfg.key}.filter`, e.target.value); render(); });
    sInput?.addEventListener('change', e => { sessionStorage.setItem(`${cfg.key}.sort`, e.target.value); render(); });
    document.querySelector('[data-clear-filters]')?.addEventListener('click', () => { sessionStorage.removeItem(`${cfg.key}.q`); sessionStorage.removeItem(`${cfg.key}.filter`); sessionStorage.removeItem(`${cfg.key}.sort`); render(); });
    document.querySelector('[data-new-entity]')?.addEventListener('click', () => openEntityModal(moduleKey));
    document.querySelector('[data-export-entity="csv"]')?.addEventListener('click', () => exportCSV(`${cfg.key}.csv`, db[cfg.key]));
    document.querySelector('[data-export-entity="json"]')?.addEventListener('click', () => exportJSON(`${cfg.key}.json`, db[cfg.key]));
    document.querySelectorAll('[data-copy]').forEach(btn => btn.addEventListener('click', (event) => { event.stopPropagation(); copyToClipboard(btn.dataset.copy); }));
    document.querySelectorAll('[data-action]').forEach(btn => btn.addEventListener('click', () => handleEntityAction(moduleKey, btn.dataset.action, btn.dataset.id)));
  }

  function openEntityModal(moduleKey, id = null) {
    const cfg = entityConfigs[moduleKey];
    const isNew = !id;
    const existing = id ? db[cfg.key].find(item => item.id === id) : null;
    const item = existing ? structuredClone(existing) : cfg.defaults();
    openModal(`
      <div class="modal-title"><div><h2>${isNew ? 'Novo' : 'Editar'} ${cfg.singular}</h2><p>Campos obrigatórios são validados antes de salvar.</p></div><button class="icon-btn" data-close-modal>×</button></div>
      <form id="entityForm" class="form-grid">
        ${cfg.fields().map(fieldHTML(item)).join('')}
        ${moduleKey === 'visitors' && !isNew ? `<div class="wide demo-note"><strong>Código gerado automaticamente</strong><p>${codePill(item.accessCode)}</p></div>` : ''}
        ${moduleKey === 'employees' && !isNew ? `<div class="wide demo-note"><strong>Código interno</strong><p>${codePill(item.internalCode)}</p></div>` : ''}
      </form>
      <div class="modal-actions"><button class="ghost-btn" data-close-modal>Cancelar</button><button class="primary-btn" data-save-entity>Salvar</button></div>`);

    document.querySelectorAll('[data-close-modal]').forEach(btn => btn.addEventListener('click', closeModal));
    document.querySelectorAll('[data-copy]').forEach(btn => btn.addEventListener('click', () => copyToClipboard(btn.dataset.copy)));
    document.querySelector('[data-save-entity]').addEventListener('click', () => {
      const formData = readForm('entityForm', cfg.fields());
      const merged = { ...item, ...formData };
      const missing = validateRequired('entityForm', cfg.fields());
      if (missing) return toast('Campos obrigatórios', 'Preencha os campos marcados para continuar.', 'danger');
      const customError = cfg.validate?.(merged, isNew);
      if (customError) return toast('Validação bloqueada', customError, 'danger');
      cfg.beforeSave?.(merged, isNew);
      if (isNew) db[cfg.key].unshift(merged); else Object.assign(existing, merged);
      saveData();
      closeModal();
      toast('Registro salvo', `${cfg.singular[0].toUpperCase() + cfg.singular.slice(1)} atualizado com sucesso.`, 'success');
      render();
    });
  }

  function fieldHTML(item) {
    return ([name, label, type, required, options]) => {
      const value = item[name];
      const req = required ? 'data-required="true"' : '';
      const cls = type === 'textarea' || type === 'multiselect' ? 'wide' : '';
      if (type === 'select') {
        const opts = (options || []).map(opt => Array.isArray(opt) ? opt : [opt, opt]);
        return `<div class="field ${cls}" data-field="${name}"><label>${label}</label><select class="select" name="${name}" ${req}>${opts.map(([val, text]) => `<option value="${escapeHTML(val)}" ${String(value) === String(val) ? 'selected' : ''}>${escapeHTML(text)}</option>`).join('')}</select><div class="error-text">Campo obrigatório.</div></div>`;
      }
      if (type === 'multiselect') {
        const vals = Array.isArray(value) ? value : [];
        const opts = (options || []).map(opt => Array.isArray(opt) ? opt : [opt, opt]);
        return `<div class="field ${cls}" data-field="${name}"><label>${label}</label><select class="select" name="${name}" multiple size="5" ${req}>${opts.map(([val, text]) => `<option value="${escapeHTML(val)}" ${vals.includes(val) ? 'selected' : ''}>${escapeHTML(text)}</option>`).join('')}</select><div class="error-text">Campo obrigatório.</div></div>`;
      }
      if (type === 'textarea') {
        return `<div class="field wide" data-field="${name}"><label>${label}</label><textarea class="textarea" name="${name}" ${req}>${escapeHTML(value || '')}</textarea><div class="error-text">Campo obrigatório.</div></div>`;
      }
      const val = type === 'datetime-local' ? dateInputValue(value) : (value || '');
      return `<div class="field ${cls}" data-field="${name}"><label>${label}</label><input class="input" type="${type}" name="${name}" value="${escapeHTML(val)}" ${req}/><div class="error-text">Campo obrigatório.</div></div>`;
    };
  }

  function readForm(formId, fields) {
    const form = el(formId);
    const data = {};
    fields.forEach(([name, , type]) => {
      const input = form.elements[name];
      if (!input) return;
      if (type === 'multiselect') data[name] = Array.from(input.selectedOptions).map(opt => opt.value);
      else data[name] = input.value.trim();
    });
    return data;
  }

  function validateRequired(formId, fields) {
    const form = el(formId);
    let missing = false;
    fields.forEach(([name, , type, required]) => {
      const wrapper = form.querySelector(`[data-field="${name}"]`);
      const input = form.elements[name];
      const value = type === 'multiselect' ? Array.from(input.selectedOptions).map(o => o.value).join(',') : input?.value?.trim();
      const bad = required && !value;
      wrapper?.classList.toggle('invalid', bad);
      if (bad) missing = true;
    });
    return missing;
  }

  function handleEntityAction(moduleKey, action, id) {
    const cfg = entityConfigs[moduleKey];
    const item = db[cfg.key].find(x => x.id === id);
    if (!item) return;
    if (action === 'edit') return openEntityModal(moduleKey, id);
    if (action === 'delete') return confirmAction(`Excluir ${cfg.singular}`, 'O registro será removido da base local demonstrativa.', () => {
      db[cfg.key] = db[cfg.key].filter(x => x.id !== id);
      if (['visitors', 'employees'].includes(moduleKey)) db.codes = db.codes.filter(c => c.ownerId !== id);
      saveData(); toast('Registro excluído', 'Remoção concluída.', 'success'); render();
    });
    if (action === 'block') { item.status = 'bloqueado'; syncCodeFromOwner(item, 'funcionário'); saveData(); render(); return toast('Funcionário bloqueado', 'Acesso interno foi bloqueado.', 'warning'); }
    if (action === 'unblock') { item.status = 'ativo'; syncCodeFromOwner(item, 'funcionário'); saveData(); render(); return toast('Funcionário liberado', 'Acesso interno restaurado.', 'success'); }
    if (['checkin', 'checkout'].includes(action)) simulatePersonMovement(moduleKey, item, action === 'checkin' ? 'entrada' : 'saída');
    if (['vehicleIn', 'vehicleOut'].includes(action)) simulateVehicleMovement(item, action === 'vehicleIn' ? 'entrada' : 'saída');
  }

  function simulatePersonMovement(moduleKey, item, direction) {
    const isEmployee = moduleKey === 'employees';
    const code = isEmployee ? item.internalCode : item.accessCode;
    const type = isEmployee ? 'funcionário' : 'visitante';
    const payload = validateAccess({ code, document: item.document, personType: type, terminalId: isEmployee ? (item.terminalsAllowed?.[0] || 'term_01') : 'term_01', turnstileId: isEmployee ? (item.turnstilesAllowed?.[0] || 'cat_1') : item.turnstileId, direction });
    toast(payload.allowed ? 'Acesso liberado' : 'Acesso negado', payload.reason, payload.allowed ? 'success' : 'danger');
    saveData(); render();
  }

  function simulateVehicleMovement(vehicle, direction) {
    const terminal = db.terminals.find(t => t.status === 'online') || db.terminals[0];
    const turnstile = db.turnstiles.find(c => c.status === 'online') || db.turnstiles[0];
    const allowed = vehicle.status === 'autorizado' && terminal.status === 'online' && turnstile.status === 'online';
    if (allowed) vehicle.inside = direction === 'entrada';
    registerEvent({ personName: vehicle.owner || vehicle.plate, personType: 'veículo', document: vehicle.plate, code: 'VEH-MANUAL', direction, terminal, turnstile, result: allowed ? 'liberado' : 'negado', reason: allowed ? 'Veículo autorizado' : 'Veículo bloqueado, terminal offline ou catraca indisponível', operator: 'Portaria', observation: vehicle.observation || '' });
    saveData(); render();
    toast(allowed ? 'Veículo liberado' : 'Veículo negado', allowed ? `${vehicle.plate} registrado com sucesso.` : 'Evento registrado como alerta.', allowed ? 'success' : 'danger');
  }

  function renderVisitors() { return renderEntityModule('visitors'); }
  function renderCompanies() { return renderEntityModule('companies'); }
  function renderEmployees() { return renderEntityModule('employees'); }
  function renderVehicles() { return renderEntityModule('vehicles'); }

  function renderCodes() {
    const q = normalize(sessionStorage.getItem('codes.q') || '');
    const status = sessionStorage.getItem('codes.status') || 'todos';
    let list = [...db.codes];
    if (q) list = list.filter(c => searchable(c).includes(q));
    if (status !== 'todos') list = list.filter(c => c.status === status);
    return `
      <section class="panel">
        <div class="section-head"><div><h2>Códigos de acesso</h2><p>Geração, validação, bloqueio, expiração e leitura simulada.</p></div><div class="action-row"><button class="primary-btn" data-generate-code>+ Gerar código</button><button class="ghost-btn" data-export-codes>Exportar CSV</button></div></div>
        <div class="filters"><input class="input" data-code-search placeholder="Buscar código, dono, tipo..."/><select class="select" data-code-status><option value="todos">Todos</option><option value="ativo">Ativo</option><option value="usado">Usado</option><option value="expirado">Expirado</option><option value="bloqueado">Bloqueado</option></select><button class="ghost-btn" data-validate-code>Validar código</button><button class="ghost-btn" data-clear-code-filter>Limpar</button></div>
        <div class="table-wrap"><table><thead><tr><th>Código</th><th>Tipo</th><th>Dono</th><th>Catracas</th><th>Terminal</th><th>Validade</th><th>Status</th><th>Último uso</th><th>Ações</th></tr></thead><tbody>
        ${list.map(c => `<tr><td>${codePill(c.code)}</td><td>${escapeHTML(c.type)}</td><td>${escapeHTML(c.ownerName)}</td><td>${c.turnstiles.map(id => db.turnstiles.find(t => t.id === id)?.name || id).join(', ')}</td><td>${escapeHTML(c.terminalId)}</td><td>${fmtDate(c.validUntil)}</td><td>${statusBadge(c.status)}</td><td>${fmtDate(c.lastUse)}</td><td><div class="btn-group"><button class="success-btn small-btn" data-read-code="${c.id}">Ler</button><button class="warning-btn small-btn" data-expire-code="${c.id}">Expirar</button><button class="danger-btn small-btn" data-block-code="${c.id}">Bloquear</button></div></td></tr>`).join('')}
        </tbody></table></div>
      </section>`;
  }

  function bindCodes() {
    const q = document.querySelector('[data-code-search]');
    const s = document.querySelector('[data-code-status]');
    if (q) q.value = sessionStorage.getItem('codes.q') || '';
    if (s) s.value = sessionStorage.getItem('codes.status') || 'todos';
    q?.addEventListener('input', e => { sessionStorage.setItem('codes.q', e.target.value); render(); });
    s?.addEventListener('change', e => { sessionStorage.setItem('codes.status', e.target.value); render(); });
    document.querySelector('[data-clear-code-filter]')?.addEventListener('click', () => { sessionStorage.removeItem('codes.q'); sessionStorage.removeItem('codes.status'); render(); });
    document.querySelector('[data-generate-code]')?.addEventListener('click', openCodeModal);
    document.querySelector('[data-export-codes]')?.addEventListener('click', () => exportCSV('codigos.csv', db.codes));
    document.querySelector('[data-validate-code]')?.addEventListener('click', openValidateCodeModal);
    document.querySelectorAll('[data-copy]').forEach(btn => btn.addEventListener('click', () => copyToClipboard(btn.dataset.copy)));
    document.querySelectorAll('[data-read-code]').forEach(btn => btn.addEventListener('click', () => simulateCodeRead(btn.dataset.readCode)));
    document.querySelectorAll('[data-expire-code]').forEach(btn => btn.addEventListener('click', () => updateCodeStatus(btn.dataset.expireCode, 'expirado')));
    document.querySelectorAll('[data-block-code]').forEach(btn => btn.addEventListener('click', () => updateCodeStatus(btn.dataset.blockCode, 'bloqueado')));
  }

  function openCodeModal() {
    openModal(`
      <div class="modal-title"><div><h2>Gerar código avulso</h2><p>Cria um código temporário demonstrativo.</p></div><button class="icon-btn" data-close-modal>×</button></div>
      <form id="codeForm" class="form-grid">
        ${fieldHTML({ type: 'temporário', ownerName: 'Visitante temporário', turnstiles: ['cat_1'], terminalId: 'term_01', validUntil: addHours(db.settings.defaultCodeHours), status: 'ativo' })(['type', 'Tipo', 'select', true, ['visitante', 'funcionário', 'veículo', 'temporário']])}
        ${fieldHTML({ ownerName: 'Visitante temporário' })(['ownerName', 'Dono do código', 'text', true])}
        ${fieldHTML({ turnstiles: ['cat_1'] })(['turnstiles', 'Catracas autorizadas', 'multiselect', true, db.turnstiles.map(c => [c.id, c.name])])}
        ${fieldHTML({ terminalId: 'term_01' })(['terminalId', 'Terminal autorizado', 'select', true, db.terminals.slice(0, 20).map(t => [t.id, t.name])])}
        ${fieldHTML({ validUntil: addHours(db.settings.defaultCodeHours) })(['validUntil', 'Validade', 'datetime-local', true])}
        ${fieldHTML({ status: 'ativo' })(['status', 'Status', 'select', true, ['ativo', 'bloqueado', 'expirado']])}
      </form>
      <div class="modal-actions"><button class="ghost-btn" data-close-modal>Cancelar</button><button class="primary-btn" data-save-code>Gerar</button></div>`);
    document.querySelectorAll('[data-close-modal]').forEach(btn => btn.addEventListener('click', closeModal));
    document.querySelector('[data-save-code]').addEventListener('click', () => {
      const fields = [['type'], ['ownerName'], ['turnstiles', '', 'multiselect'], ['terminalId'], ['validUntil'], ['status']];
      const data = readForm('codeForm', fields);
      data.id = uid('code'); data.code = generateCode(data.type); data.ownerId = 'manual'; data.validUntil = new Date(data.validUntil).toISOString(); data.generatedAt = nowISO(); data.lastUse = null;
      db.codes.unshift(data); saveData(); closeModal(); toast('Código gerado', data.code, 'success'); render();
    });
  }

  function openValidateCodeModal() {
    openModal(`<div class="modal-title"><div><h2>Validar código</h2><p>Consulta status, validade e permissões.</p></div><button class="icon-btn" data-close-modal>×</button></div><div class="form-grid"><div class="field wide"><label>Código</label><input class="input" id="quickCode" placeholder="VIS-XXX-0000"/></div></div><div id="quickCodeResult"></div><div class="modal-actions"><button class="ghost-btn" data-close-modal>Fechar</button><button class="primary-btn" data-run-code-validation>Validar</button></div>`);
    document.querySelectorAll('[data-close-modal]').forEach(btn => btn.addEventListener('click', closeModal));
    document.querySelector('[data-run-code-validation]').addEventListener('click', () => {
      const code = el('quickCode').value.trim();
      const result = validateAccess({ code, terminalId: 'term_01', turnstileId: 'cat_1', direction: 'entrada', dryRun: true });
      el('quickCodeResult').innerHTML = `<div class="demo-note" style="margin-top:16px"><strong>${result.allowed ? 'Código válido' : 'Código inválido'}</strong><p>${escapeHTML(result.reason)}</p></div>`;
    });
  }

  function simulateCodeRead(codeId) {
    const code = db.codes.find(c => c.id === codeId);
    if (!code) return;
    const result = validateAccess({ code: code.code, terminalId: code.terminalId, turnstileId: code.turnstiles[0], direction: 'entrada' });
    saveData(); render();
    toast(result.allowed ? 'Leitura liberada' : 'Leitura negada', result.reason, result.allowed ? 'success' : 'danger');
  }

  function updateCodeStatus(id, status) {
    const code = db.codes.find(c => c.id === id);
    if (!code) return;
    code.status = status;
    saveData(); render(); toast('Código atualizado', `Status alterado para ${status}.`, 'warning');
  }

  function renderCollector() {
    return `
      <section class="collector-screen">
        <div class="panel">
          <div class="section-head"><div><h2>Painel do coletor</h2><p>Validação simulada de código, documento, terminal, catraca e direção.</p></div></div>
          <form id="collectorForm" class="form-grid">
            <div class="field"><label>Código de acesso</label><input class="input" name="code" placeholder="VIS-DEMO-16" /></div>
            <div class="field"><label>Documento</label><input class="input" name="document" placeholder="CPF, RG, matrícula ou placa" /></div>
            <div class="field"><label>Tipo de pessoa</label><select class="select" name="personType"><option value="visitante">Visitante</option><option value="funcionário">Funcionário</option><option value="veículo">Veículo</option></select></div>
            <div class="field"><label>Terminal</label><select class="select" name="terminalId">${db.terminals.slice(0, 80).map(t => `<option value="${t.id}">${t.name} • ${t.status}</option>`).join('')}</select></div>
            <div class="field"><label>Catraca</label><select class="select" name="turnstileId">${db.turnstiles.map(c => `<option value="${c.id}">${c.name} • ${c.status}</option>`).join('')}</select></div>
            <div class="field"><label>Direção</label><select class="select" name="direction"><option value="entrada">Entrada</option><option value="saída">Saída</option></select></div>
            <div class="wide action-row"><button class="primary-btn" type="button" data-run-collector>Validar e registrar</button><button class="ghost-btn" type="button" data-fill-demo-code>Usar código demo</button></div>
          </form>
        </div>
        <div class="collector-result" id="collectorResult">
          <div><div class="access-orb">◌</div><h2>Aguardando leitura</h2><p class="metric-note">Digite código ou documento para simular o coletor.</p></div>
        </div>
      </section>`;
  }

  function bindCollector() {
    document.querySelector('[data-fill-demo-code]')?.addEventListener('click', () => { document.forms.collectorForm.code.value = db.codes.find(c => c.status === 'ativo')?.code || ''; });
    document.querySelector('[data-run-collector]')?.addEventListener('click', () => {
      const form = document.forms.collectorForm;
      const payload = validateAccess({ code: form.code.value.trim(), document: form.document.value.trim(), personType: form.personType.value, terminalId: form.terminalId.value, turnstileId: form.turnstileId.value, direction: form.direction.value });
      renderCollectorResult(payload);
      saveData();
    });
  }

  function renderCollectorResult(payload) {
    const icon = payload.allowed ? '✓' : '×';
    el('collectorResult').innerHTML = `<div><div class="access-orb ${payload.allowed ? 'allowed' : 'denied'}">${icon}</div><h2>${payload.message}</h2><p class="metric-note">${escapeHTML(payload.reason)}</p><div style="margin-top:14px">${payload.allowed ? statusBadge('liberado') : statusBadge('negado')}</div></div>`;
  }

  function validateAccess({ code, document, personType, terminalId, turnstileId, direction, dryRun = false }) {
    const terminal = db.terminals.find(t => t.id === terminalId);
    const turnstile = db.turnstiles.find(c => c.id === turnstileId);
    const network = terminal ? db.networks.find(n => n.id === terminal.networkId) : null;
    const failure = (reason, person = null, codeObj = null) => {
      if (!dryRun) registerEvent({ personName: person?.name || person?.owner || 'Não identificado', personType: personType || codeObj?.type || 'desconhecido', document: document || person?.document || person?.plate || '—', code: code || codeObj?.code || '—', direction, terminal, turnstile, result: 'negado', reason, operator: 'Coletor', observation: 'Tentativa automática pelo painel do coletor.' });
      return { allowed: false, message: accessMessage(reason), reason };
    };

    if (!terminal) return failure('Terminal não encontrado');
    if (terminal.status !== 'online') return failure('Terminal offline não libera catraca');
    if (!network || network.status !== 'online') return failure('Rede offline ou instável');
    if (!turnstile || turnstile.status !== 'online') return failure('Catraca indisponível');

    let codeObj = code ? db.codes.find(c => normalize(c.code) === normalize(code)) : null;
    let person = null;
    let type = personType || codeObj?.type;

    if (codeObj) {
      person = findOwnerByCode(codeObj);
      type = codeObj.type;
      if (codeObj.status === 'bloqueado') return failure('Código bloqueado', person, codeObj);
      if (codeObj.status === 'expirado' || new Date(codeObj.validUntil) < new Date()) return failure('Código expirado', person, codeObj);
      if (!codeObj.turnstiles.includes(turnstileId)) return failure('Permissão insuficiente para esta catraca', person, codeObj);
      if (codeObj.terminalId && codeObj.terminalId !== terminalId && !String(codeObj.terminalId).startsWith('term_')) return failure('Terminal não autorizado para o código', person, codeObj);
    } else if (document) {
      person = findByDocument(document, personType);
      if (!person) return failure('Documento não encontrado');
      type = personType;
      codeObj = db.codes.find(c => c.ownerId === person.id) || null;
    } else {
      return failure('Informe código ou documento');
    }

    if (!person && codeObj?.ownerId !== 'manual') return failure('Dono do código não encontrado', null, codeObj);

    if (person) {
      const personStatus = person.status;
      if (['bloqueado', 'desligado', 'expirado'].includes(personStatus)) return failure(`${typeLabel(type)} ${personStatus}`, person, codeObj);
      if (type === 'visitante' && person.turnstileId !== turnstileId) return failure('Visitante sem permissão nesta catraca', person, codeObj);
      if (type === 'funcionário' && !person.turnstilesAllowed?.includes(turnstileId)) return failure('Funcionário sem permissão nesta catraca', person, codeObj);
      if (type === 'veículo' && person.status !== 'autorizado') return failure('Veículo bloqueado ou pendente', person, codeObj);
      if (direction === 'saída' && !person.inside) return failure('Saída sem entrada anterior', person, codeObj);
      if (!dryRun) person.inside = direction === 'entrada';
    }

    if (!dryRun) {
      if (codeObj) { codeObj.lastUse = nowISO(); if (codeObj.type === 'temporário') codeObj.status = 'usado'; }
      releaseTurnstile(turnstileId, direction, false);
      registerEvent({ personName: person?.name || person?.owner || codeObj.ownerName, personType: type, document: document || person?.document || person?.plate || '—', code: codeObj?.code || code || '—', direction, terminal, turnstile, result: 'liberado', reason: 'Acesso autorizado', operator: 'Coletor', observation: 'Liberação automática pelo coletor.' });
    }
    return { allowed: true, message: 'Acesso liberado', reason: `Permissão validada em ${turnstile.name} via ${terminal.name}.` };
  }

  function accessMessage(reason) {
    if (reason.includes('expirado')) return 'Código expirado';
    if (reason.includes('Documento')) return 'Documento não encontrado';
    if (reason.includes('Permissão') || reason.includes('sem permissão')) return 'Permissão insuficiente';
    return 'Acesso negado';
  }

  function typeLabel(type) { return type === 'funcionário' ? 'Funcionário' : type === 'veículo' ? 'Veículo' : 'Visitante'; }

  function findOwnerByCode(codeObj) {
    if (!codeObj) return null;
    if (codeObj.type === 'visitante') return db.visitors.find(v => v.id === codeObj.ownerId);
    if (codeObj.type === 'funcionário') return db.employees.find(e => e.id === codeObj.ownerId);
    if (codeObj.type === 'veículo') return db.vehicles.find(v => v.id === codeObj.ownerId);
    return { id: codeObj.ownerId, name: codeObj.ownerName, document: '—', status: codeObj.status === 'ativo' ? 'autorizado' : codeObj.status, inside: false };
  }

  function findByDocument(document, personType) {
    const q = normalize(document);
    if (personType === 'visitante') return db.visitors.find(v => normalize(v.document) === q);
    if (personType === 'funcionário') return db.employees.find(e => normalize(e.document) === q || normalize(e.registration) === q);
    if (personType === 'veículo') return db.vehicles.find(v => normalize(v.plate) === q);
    return db.visitors.find(v => normalize(v.document) === q) || db.employees.find(e => normalize(e.document) === q || normalize(e.registration) === q) || db.vehicles.find(v => normalize(v.plate) === q);
  }

  function registerEvent({ personName, personType, document, code, direction, terminal, turnstile, result, reason, operator, observation }) {
    const network = terminal ? db.networks.find(n => n.id === terminal.networkId) : null;
    db.history.unshift({ id: uid('hist'), personName, personType, document, code, timestamp: nowISO(), direction: direction || 'entrada', turnstileId: turnstile?.id || '—', turnstileName: turnstile?.name || '—', terminalId: terminal?.id || '—', terminalName: terminal?.name || '—', networkId: network?.id || '—', networkName: network?.name || '—', result, reason, operator, observation });
  }

  function releaseTurnstile(turnstileId, direction = 'entrada', manual = true) {
    const turnstile = db.turnstiles.find(c => c.id === turnstileId);
    if (!turnstile) return false;
    turnstile.lastRelease = nowISO();
    if (direction === 'saída') turnstile.exits += 1; else turnstile.entries += 1;
    if (manual) {
      const terminal = db.terminals.find(t => t.id === turnstile.terminalId) || db.terminals[0];
      registerEvent({ personName: 'Liberação manual', personType: 'manual', document: '—', code: 'MANUAL', direction, terminal, turnstile, result: 'liberado', reason: 'Administrador liberou manualmente', operator: 'Administrador', observation: 'Evento manual.' });
    }
    saveData();
    return true;
  }

  function renderTurnstiles() {
    return `<section class="panel"><div class="section-head"><div><h2>Catracas</h2><p>Controle operacional com liberação, bloqueio, status e animação visual.</p></div><button class="ghost-btn" data-export-turnstiles>Exportar JSON</button></div><div class="turnstile-grid">${db.turnstiles.map(c => turnstileCard(c)).join('')}</div></section>`;
  }

  function turnstileCard(c) {
    const terminal = db.terminals.find(t => t.id === c.terminalId);
    const network = db.networks.find(n => n.id === c.networkId);
    return `<article class="card turnstile-card" data-turnstile-card="${c.id}"><div class="section-head"><div><h3>${escapeHTML(c.name)}</h3><p>${escapeHTML(c.location)}</p></div>${statusBadge(c.status)}</div><div class="gate-visual"><span>Poste</span><div class="gate-arm"></div><span>Fluxo</span></div><div class="device-meta"><div><span>Rede</span><b>${escapeHTML(network?.name || c.networkId)}</b></div><div><span>Terminal</span><b>${escapeHTML(terminal?.name || c.terminalId)}</b></div><div><span>Modo</span><b>${escapeHTML(c.mode)}</b></div><div><span>Última liberação</span><b>${fmtDate(c.lastRelease)}</b></div><div><span>Entradas</span><b>${c.entries}</b></div><div><span>Saídas</span><b>${c.exits}</b></div></div><div class="btn-group"><button class="success-btn small-btn" data-release-turnstile="${c.id}">Liberar</button><button class="warning-btn small-btn" data-pass-turnstile="${c.id}">Simular passagem</button><button class="ghost-btn small-btn" data-toggle-turnstile="${c.id}">Alternar status</button><button class="danger-btn small-btn" data-block-turnstile="${c.id}">Bloquear</button></div></article>`;
  }

  function bindTurnstiles() {
    document.querySelector('[data-export-turnstiles]')?.addEventListener('click', () => exportJSON('catracas.json', db.turnstiles));
    document.querySelectorAll('[data-release-turnstile]').forEach(btn => btn.addEventListener('click', () => animateTurnstile(btn.dataset.releaseTurnstile, 'entrada')));
    document.querySelectorAll('[data-pass-turnstile]').forEach(btn => btn.addEventListener('click', () => animateTurnstile(btn.dataset.passTurnstile, Math.random() > .5 ? 'entrada' : 'saída')));
    document.querySelectorAll('[data-toggle-turnstile]').forEach(btn => btn.addEventListener('click', () => { const c = db.turnstiles.find(x => x.id === btn.dataset.toggleTurnstile); c.status = c.status === 'online' ? 'offline' : 'online'; saveData(); render(); }));
    document.querySelectorAll('[data-block-turnstile]').forEach(btn => btn.addEventListener('click', () => { const c = db.turnstiles.find(x => x.id === btn.dataset.blockTurnstile); c.status = 'bloqueada'; saveData(); render(); toast('Catraca bloqueada', c.name, 'warning'); }));
  }

  function animateTurnstile(id, direction) {
    const c = db.turnstiles.find(x => x.id === id);
    if (c.status !== 'online') return toast('Liberação negada', 'Catraca não está online.', 'danger');
    releaseTurnstile(id, direction, true);
    const card = document.querySelector(`[data-turnstile-card="${id}"]`);
    card?.classList.add('open');
    setTimeout(() => { card?.classList.remove('open'); render(); }, 850);
    toast('Catraca liberada', `${c.name} liberada para ${direction}.`, 'success');
  }

  function renderTerminals() {
    const q = normalize(sessionStorage.getItem('terminals.q') || '');
    const net = sessionStorage.getItem('terminals.net') || 'todos';
    const status = sessionStorage.getItem('terminals.status') || 'todos';
    let list = [...db.terminals];
    if (q) list = list.filter(t => searchable(t).includes(q));
    if (net !== 'todos') list = list.filter(t => t.networkId === net);
    if (status !== 'todos') list = list.filter(t => t.status === status);
    return `<section class="panel"><div class="section-head"><div><h2>Terminais</h2><p>Até 80 terminais simulados com rede, IP, status e comunicação.</p></div><button class="ghost-btn" data-export-terminals>Exportar CSV</button></div><div class="filters"><input class="input" data-terminal-search placeholder="Buscar terminal, IP, local..."/><select class="select" data-terminal-net><option value="todos">Todas as redes</option>${db.networks.map(n => `<option value="${n.id}">${n.name}</option>`).join('')}</select><select class="select" data-terminal-status><option value="todos">Todos status</option><option value="online">Online</option><option value="offline">Offline</option><option value="manutenção">Manutenção</option></select><button class="ghost-btn" data-clear-terminal>Limpar</button></div><div class="table-wrap"><table><thead><tr><th>ID</th><th>Terminal</th><th>Local</th><th>Rede/IP</th><th>Catraca</th><th>Status</th><th>Última comunicação</th><th>Ações</th></tr></thead><tbody>${list.map(t => `<tr><td><strong>${t.id}</strong></td><td>${escapeHTML(t.name)}<span class="sub">${escapeHTML(t.type)}</span></td><td>${escapeHTML(t.local)}</td><td>${escapeHTML(t.networkId)}<span class="sub">${escapeHTML(t.ip)}</span></td><td>${escapeHTML(t.turnstileId)}</td><td>${statusBadge(t.status)}</td><td>${fmtDate(t.lastCommunication)}</td><td><div class="btn-group"><button class="success-btn small-btn" data-comm-terminal="${t.id}">Comunicar</button><button class="ghost-btn small-btn" data-toggle-terminal="${t.id}">Ativar/desativar</button><button class="ghost-btn small-btn" data-assoc-terminal="${t.id}">Associar</button></div></td></tr>`).join('')}</tbody></table></div></section>`;
  }

  function bindTerminals() {
    const q = document.querySelector('[data-terminal-search]'); const n = document.querySelector('[data-terminal-net]'); const s = document.querySelector('[data-terminal-status]');
    if (q) q.value = sessionStorage.getItem('terminals.q') || ''; if (n) n.value = sessionStorage.getItem('terminals.net') || 'todos'; if (s) s.value = sessionStorage.getItem('terminals.status') || 'todos';
    q?.addEventListener('input', e => { sessionStorage.setItem('terminals.q', e.target.value); render(); }); n?.addEventListener('change', e => { sessionStorage.setItem('terminals.net', e.target.value); render(); }); s?.addEventListener('change', e => { sessionStorage.setItem('terminals.status', e.target.value); render(); });
    document.querySelector('[data-clear-terminal]')?.addEventListener('click', () => { ['terminals.q', 'terminals.net', 'terminals.status'].forEach(k => sessionStorage.removeItem(k)); render(); });
    document.querySelector('[data-export-terminals]')?.addEventListener('click', () => exportCSV('terminais.csv', db.terminals));
    document.querySelectorAll('[data-comm-terminal]').forEach(btn => btn.addEventListener('click', () => { const t = db.terminals.find(x => x.id === btn.dataset.commTerminal); t.lastCommunication = nowISO(); t.status = 'online'; saveData(); render(); toast('Comunicação OK', `${t.name} respondeu ao heartbeat.`, 'success'); }));
    document.querySelectorAll('[data-toggle-terminal]').forEach(btn => btn.addEventListener('click', () => { const t = db.terminals.find(x => x.id === btn.dataset.toggleTerminal); t.status = t.status === 'online' ? 'offline' : 'online'; t.lastCommunication = nowISO(); saveData(); render(); }));
    document.querySelectorAll('[data-assoc-terminal]').forEach(btn => btn.addEventListener('click', () => openAssociateTerminal(btn.dataset.assocTerminal)));
  }

  function openAssociateTerminal(id) {
    const t = db.terminals.find(x => x.id === id);
    openModal(`<div class="modal-title"><div><h2>Associar terminal</h2><p>${escapeHTML(t.name)} pode ser vinculado a uma catraca.</p></div><button class="icon-btn" data-close-modal>×</button></div><div class="field"><label>Catraca associada</label><select class="select" id="assocTurnstile">${db.turnstiles.map(c => `<option value="${c.id}" ${t.turnstileId === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}</select></div><div class="modal-actions"><button class="ghost-btn" data-close-modal>Cancelar</button><button class="primary-btn" data-save-assoc>Salvar</button></div>`);
    document.querySelectorAll('[data-close-modal]').forEach(btn => btn.addEventListener('click', closeModal));
    document.querySelector('[data-save-assoc]').addEventListener('click', () => { t.turnstileId = el('assocTurnstile').value; saveData(); closeModal(); render(); toast('Terminal associado', `${t.name} atualizado.`, 'success'); });
  }

  function renderNetworks() {
    return `<section class="panel"><div class="section-head"><div><h2>Redes</h2><p>Impacto de rede sobre terminais e catracas vinculadas.</p></div><button class="ghost-btn" data-export-networks>Exportar JSON</button></div><div class="network-grid">${db.networks.map(n => networkCard(n)).join('')}</div></section>`;
  }

  function networkCard(n) {
    const terms = db.terminals.filter(t => t.networkId === n.id);
    return `<article class="card"><div class="section-head"><div><h3>${escapeHTML(n.name)}</h3><p>${escapeHTML(n.range)}</p></div>${statusBadge(n.status)}</div><div class="device-meta"><div><span>Terminais</span><b>${terms.length}</b></div><div><span>Catracas</span><b>${n.turnstiles.length}</b></div><div><span>Offline</span><b>${terms.filter(t => t.status !== 'online').length}</b></div></div><p class="metric-note">${escapeHTML(n.observation || '')}</p><div class="btn-group" style="margin-top:14px"><button class="ghost-btn small-btn" data-edit-network="${n.id}">Editar</button><button class="warning-btn small-btn" data-toggle-network="${n.id}">Online/offline</button><button class="ghost-btn small-btn" data-view-network-terms="${n.id}">Ver terminais</button></div></article>`;
  }

  function bindNetworks() {
    document.querySelector('[data-export-networks]')?.addEventListener('click', () => exportJSON('redes.json', db.networks));
    document.querySelectorAll('[data-edit-network]').forEach(btn => btn.addEventListener('click', () => openNetworkModal(btn.dataset.editNetwork)));
    document.querySelectorAll('[data-toggle-network]').forEach(btn => btn.addEventListener('click', () => toggleNetwork(btn.dataset.toggleNetwork)));
    document.querySelectorAll('[data-view-network-terms]').forEach(btn => btn.addEventListener('click', () => { sessionStorage.setItem('terminals.net', btn.dataset.viewNetworkTerms); location.hash = 'terminals'; }));
  }

  function toggleNetwork(id) {
    const n = db.networks.find(x => x.id === id);
    const online = n.status !== 'online';
    n.status = online ? 'online' : 'offline';
    db.terminals.filter(t => t.networkId === id).forEach(t => { t.status = online ? 'online' : 'offline'; t.lastCommunication = nowISO(); });
    saveData(); render(); toast('Rede atualizada', `${n.name} ${n.status}. Terminais vinculados foram impactados.`, online ? 'success' : 'warning');
  }

  function openNetworkModal(id) {
    const n = db.networks.find(x => x.id === id);
    openModal(`<div class="modal-title"><div><h2>Editar rede</h2><p>Alteração visual de faixa IP, status e observação.</p></div><button class="icon-btn" data-close-modal>×</button></div><form id="networkForm" class="form-grid"><div class="field"><label>Nome</label><input class="input" name="name" value="${escapeHTML(n.name)}" /></div><div class="field"><label>Faixa IP</label><input class="input" name="range" value="${escapeHTML(n.range)}" /></div><div class="field"><label>Status</label><select class="select" name="status">${['online', 'offline', 'instável'].map(s => `<option ${n.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div><div class="field wide"><label>Observação</label><textarea class="textarea" name="observation">${escapeHTML(n.observation || '')}</textarea></div></form><div class="modal-actions"><button class="ghost-btn" data-close-modal>Cancelar</button><button class="primary-btn" data-save-network>Salvar</button></div>`);
    document.querySelectorAll('[data-close-modal]').forEach(btn => btn.addEventListener('click', closeModal));
    document.querySelector('[data-save-network]').addEventListener('click', () => { Object.assign(n, readSimpleForm('networkForm')); saveData(); closeModal(); render(); toast('Rede salva', n.name, 'success'); });
  }

  function readSimpleForm(formId) {
    return Object.fromEntries(Array.from(new FormData(el(formId))).map(([k, v]) => [k, String(v).trim()]));
  }

  function renderPermissions() {
    const keys = Object.keys(permissionLabels);
    return `<section class="panel"><div class="section-head"><div><h2>Matriz de permissões</h2><p>Perfis simulados com permissões visuais editáveis.</p></div><button class="ghost-btn" data-reset-permissions>Restaurar padrão</button></div><div class="table-wrap"><table class="permission-table"><thead><tr><th>Perfil</th>${keys.map(k => `<th>${permissionLabels[k]}</th>`).join('')}</tr></thead><tbody>${roleLabels.map(role => `<tr><td><strong>${role}</strong></td>${keys.map(k => `<td><input type="checkbox" data-permission-role="${role}" data-permission-key="${k}" ${db.permissions[role]?.[k] ? 'checked' : ''}></td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`;
  }

  function bindPermissions() {
    document.querySelectorAll('[data-permission-role]').forEach(input => input.addEventListener('change', () => { db.permissions[input.dataset.permissionRole][input.dataset.permissionKey] = input.checked; saveData(); toast('Permissão atualizada', `${input.dataset.permissionRole}: ${permissionLabels[input.dataset.permissionKey]}`, 'success'); }));
    document.querySelector('[data-reset-permissions]')?.addEventListener('click', () => confirmAction('Restaurar permissões', 'A matriz será recriada com os valores demonstrativos.', () => { db.permissions = seedData(false).permissions; saveData(); render(); }));
  }

  function renderMovement() {
    const q = normalize(sessionStorage.getItem('history.q') || '');
    const result = sessionStorage.getItem('history.result') || 'todos';
    const turnstile = sessionStorage.getItem('history.turnstile') || 'todos';
    const terminal = sessionStorage.getItem('history.terminal') || 'todos';
    let rows = [...db.history];
    if (q) rows = rows.filter(h => searchable(h).includes(q));
    if (result !== 'todos') rows = rows.filter(h => h.result === result);
    if (turnstile !== 'todos') rows = rows.filter(h => h.turnstileId === turnstile);
    if (terminal !== 'todos') rows = rows.filter(h => h.terminalId === terminal);
    return `<section class="panel"><div class="section-head"><div><h2>Entrada e Saída</h2><p>Histórico completo de movimentação e tentativas negadas.</p></div><div class="action-row"><button class="ghost-btn" data-export-history-csv>CSV</button><button class="ghost-btn" data-export-history-json>JSON</button><button class="danger-btn" data-clear-history>Limpar histórico</button></div></div><div class="filters"><input class="input" data-history-search placeholder="Pessoa, documento, código..."/><select class="select" data-history-result><option value="todos">Todos resultados</option><option value="liberado">Liberado</option><option value="negado">Negado</option></select><select class="select" data-history-turnstile><option value="todos">Todas catracas</option>${db.turnstiles.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}</select><select class="select" data-history-terminal><option value="todos">Todos terminais</option>${db.terminals.slice(0, 20).map(t => `<option value="${t.id}">${t.name}</option>`).join('')}</select></div>${historyTable(rows)}</section>`;
  }

  function historyTable(rows) {
    return rows.length ? `<div class="table-wrap"><table><thead><tr><th>Pessoa</th><th>Tipo</th><th>Documento/Código</th><th>Data/Hora</th><th>Direção</th><th>Catraca</th><th>Terminal/Rede</th><th>Resultado</th><th>Motivo</th><th>Operador</th></tr></thead><tbody>${rows.map(h => `<tr><td><strong>${escapeHTML(h.personName)}</strong></td><td>${escapeHTML(h.personType)}</td><td>${escapeHTML(h.document)}<span class="sub">${escapeHTML(h.code)}</span></td><td>${fmtDate(h.timestamp)}</td><td>${escapeHTML(h.direction)}</td><td>${escapeHTML(h.turnstileName)}</td><td>${escapeHTML(h.terminalName)}<span class="sub">${escapeHTML(h.networkName)}</span></td><td>${statusBadge(h.result)}</td><td>${escapeHTML(h.reason)}</td><td>${escapeHTML(h.operator)}</td></tr>`).join('')}</tbody></table></div>` : emptyState('Nenhum evento encontrado.', '↕');
  }

  function bindMovement() {
    const map = [['history.q', '[data-history-search]'], ['history.result', '[data-history-result]'], ['history.turnstile', '[data-history-turnstile]'], ['history.terminal', '[data-history-terminal]']];
    map.forEach(([key, selector]) => { const input = document.querySelector(selector); if (!input) return; input.value = sessionStorage.getItem(key) || (key === 'history.q' ? '' : 'todos'); input.addEventListener(input.tagName === 'INPUT' ? 'input' : 'change', e => { sessionStorage.setItem(key, e.target.value); render(); }); });
    document.querySelector('[data-export-history-csv]')?.addEventListener('click', () => exportCSV('historico.csv', db.history));
    document.querySelector('[data-export-history-json]')?.addEventListener('click', () => exportJSON('historico.json', db.history));
    document.querySelector('[data-clear-history]')?.addEventListener('click', () => confirmAction('Limpar histórico', 'Todos os eventos locais serão removidos.', () => { db.history = []; saveData(); render(); toast('Histórico limpo', 'Eventos removidos da base local.', 'warning'); }));
  }

  function renderReports() {
    const report = sessionStorage.getItem('report.type') || 'visitorsToday';
    currentReportRows = getReportRows(report);
    const cards = [
      ['Visitantes do dia', db.history.filter(h => h.personType === 'visitante' && h.timestamp.startsWith(todayKey())).length, '◉'],
      ['Funcionários que entraram', new Set(db.history.filter(h => h.personType === 'funcionário' && h.direction === 'entrada' && h.result === 'liberado').map(h => h.personName)).size, '◆'],
      ['Acessos negados', db.history.filter(h => h.result === 'negado').length, '⛔'],
      ['Veículos registrados', db.vehicles.length, '▰'],
      ['Terminais offline', db.terminals.filter(t => t.status !== 'online').length, '▤'],
      ['Empresas com visitantes', new Set(db.visitors.map(v => v.companyOrigin)).size, '▣']
    ];
    return `<section class="grid report-cards">${cards.map(([l, v, i]) => metric(l, v, 'Relatório demonstrativo', i)).join('')}</section><section class="panel"><div class="section-head"><div><h2>Relatórios</h2><p>Gere visões simples e exporte CSV ou JSON.</p></div><div class="action-row"><select class="select" data-report-type><option value="visitorsToday">Visitantes do dia</option><option value="employeesIn">Funcionários que entraram</option><option value="denied">Acessos negados</option><option value="vehicles">Veículos registrados</option><option value="turnstilesUsage">Catracas mais usadas</option><option value="offlineTerminals">Terminais offline</option><option value="companiesRanking">Empresas com mais visitantes</option><option value="historyPeriod">Histórico por período</option></select><button class="ghost-btn" data-export-report-csv>CSV</button><button class="ghost-btn" data-export-report-json>JSON</button></div></div>${reportTable(currentReportRows)}</section>`;
  }

  function getReportRows(type) {
    const today = todayKey();
    if (type === 'visitorsToday') return db.history.filter(h => h.personType === 'visitante' && h.timestamp.startsWith(today));
    if (type === 'employeesIn') return db.history.filter(h => h.personType === 'funcionário' && h.direction === 'entrada' && h.result === 'liberado');
    if (type === 'denied') return db.history.filter(h => h.result === 'negado');
    if (type === 'vehicles') return db.vehicles;
    if (type === 'turnstilesUsage') return db.turnstiles.map(c => ({ catraca: c.name, local: c.location, entradas: c.entries, saidas: c.exits, total: c.entries + c.exits, status: c.status }));
    if (type === 'offlineTerminals') return db.terminals.filter(t => t.status !== 'online');
    if (type === 'companiesRanking') return db.companies.map(c => ({ empresa: c.name, visitantes: db.visitors.filter(v => normalize(v.companyOrigin) === normalize(c.name)).length, status: c.status })).sort((a, b) => b.visitantes - a.visitantes);
    return db.history;
  }

  function reportTable(rows) {
    if (!rows.length) return emptyState('Relatório sem dados.', '◧');
    const keys = Object.keys(rows[0]).slice(0, 9);
    return `<div class="table-wrap"><table><thead><tr>${keys.map(k => `<th>${escapeHTML(k)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${keys.map(k => `<td>${escapeHTML(Array.isArray(row[k]) ? row[k].join(', ') : row[k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  function bindReports() {
    const select = document.querySelector('[data-report-type]');
    if (select) select.value = sessionStorage.getItem('report.type') || 'visitorsToday';
    select?.addEventListener('change', e => { sessionStorage.setItem('report.type', e.target.value); render(); });
    document.querySelector('[data-export-report-csv]')?.addEventListener('click', () => exportCSV('relatorio.csv', currentReportRows));
    document.querySelector('[data-export-report-json]')?.addEventListener('click', () => exportJSON('relatorio.json', currentReportRows));
  }

  function renderSettings() {
    return `<section class="panel"><div class="section-head"><div><h2>Configurações</h2><p>Ajustes locais do protótipo, backup e reset da base demo.</p></div></div><form id="settingsForm" class="form-grid"><div class="field"><label>Nome da empresa usuária</label><input class="input" name="companyName" value="${escapeHTML(db.settings.companyName)}" /></div><div class="field"><label>Quantidade de terminais simulados</label><input class="input" name="terminalCount" type="number" min="1" max="80" value="${db.settings.terminalCount}" /></div><div class="field"><label>Redes ativas</label><input class="input" name="activeNetworks" type="number" min="1" max="5" value="${db.settings.activeNetworks}" /></div><div class="field"><label>Validade padrão do código (horas)</label><input class="input" name="defaultCodeHours" type="number" min="1" max="168" value="${db.settings.defaultCodeHours}" /></div><div class="field"><label>Modo demonstração</label><select class="select" name="demoMode"><option value="true" ${db.settings.demoMode ? 'selected' : ''}>Ativo</option><option value="false" ${!db.settings.demoMode ? 'selected' : ''}>Inativo</option></select></div></form><div class="demo-note" style="margin-top:16px"><strong>Modo Demonstração</strong><p>Este sistema é um protótipo visual e funcional em front-end. Produção real exige backend, banco de dados, API segura, autenticação, autorização no servidor, criptografia, trilhas de auditoria imutáveis, controle de sessão, integração com hardware e validação de infraestrutura.</p></div><div class="action-row" style="margin-top:18px"><button class="primary-btn" data-save-settings>Salvar configurações</button><button class="ghost-btn" data-export-backup>Exportar backup JSON</button><label class="ghost-btn"><input type="file" data-import-backup accept="application/json" hidden/>Importar backup</label><button class="danger-btn" data-reset-system>Resetar dados</button></div></section>`;
  }

  function bindSettings() {
    document.querySelector('[data-save-settings]')?.addEventListener('click', () => {
      const data = readSimpleForm('settingsForm');
      db.settings = { ...db.settings, ...data, terminalCount: Math.min(80, Math.max(1, Number(data.terminalCount || 80))), activeNetworks: Number(data.activeNetworks || 5), defaultCodeHours: Number(data.defaultCodeHours || 8), demoMode: data.demoMode === 'true' };
      saveData(); toast('Configurações salvas', 'Preferências locais atualizadas.', 'success'); render();
    });
    document.querySelector('[data-export-backup]')?.addEventListener('click', () => exportJSON('accesscore-backup.json', db));
    document.querySelector('[data-import-backup]')?.addEventListener('change', importBackup);
    document.querySelector('[data-reset-system]')?.addEventListener('click', () => confirmAction('Resetar sistema', 'A base local será recriada com dados demonstrativos.', () => { localStorage.removeItem(STORAGE_KEY); loadData(); render(); toast('Sistema resetado', 'Dados demonstrativos recriados.', 'warning'); }));
  }

  function importBackup(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        db = migrate(JSON.parse(reader.result)); saveData(); render(); toast('Backup importado', 'Base local substituída com sucesso.', 'success');
      } catch (error) { toast('Importação falhou', 'Arquivo JSON inválido.', 'danger'); }
    };
    reader.readAsText(file);
  }

  function openModal(html) {
    el('modal').innerHTML = html;
    el('modalBackdrop').classList.remove('hidden');
  }

  function closeModal() {
    el('modalBackdrop').classList.add('hidden');
    el('modal').innerHTML = '';
  }

  function confirmAction(title, text, onOk) {
    el('confirmTitle').textContent = title;
    el('confirmText').textContent = text;
    el('confirmBackdrop').classList.remove('hidden');
    const cleanup = () => {
      el('confirmBackdrop').classList.add('hidden');
      el('confirmOk').onclick = null; el('confirmCancel').onclick = null;
    };
    el('confirmCancel').onclick = cleanup;
    el('confirmOk').onclick = () => { onOk(); cleanup(); };
  }

  function toast(title, message, type = 'info') {
    const icon = type === 'success' ? '✓' : type === 'danger' ? '×' : type === 'warning' ? '!' : 'i';
    const node = document.createElement('div');
    node.className = 'toast';
    node.innerHTML = `<div>${icon}</div><div><strong>${escapeHTML(title)}</strong><span>${escapeHTML(message)}</span></div>`;
    el('toastStack').appendChild(node);
    setTimeout(() => node.remove(), 3600);
  }

  function copyToClipboard(text) {
    if (!text) return;
    navigator.clipboard?.writeText(text).then(() => toast('Copiado', text, 'success')).catch(() => {
      const tmp = document.createElement('textarea'); tmp.value = text; document.body.appendChild(tmp); tmp.select(); document.execCommand('copy'); tmp.remove(); toast('Copiado', text, 'success');
    });
  }

  function exportJSON(filename, rows) {
    downloadFile(filename, JSON.stringify(rows, null, 2), 'application/json;charset=utf-8');
  }

  function exportCSV(filename, rows) {
    if (!rows?.length) return toast('Exportação vazia', 'Não há registros para exportar.', 'warning');
    const keys = Object.keys(rows[0]);
    const csv = [keys.join(','), ...rows.map(row => keys.map(k => csvCell(Array.isArray(row[k]) ? row[k].join('|') : row[k])).join(','))].join('\n');
    downloadFile(filename, csv, 'text/csv;charset=utf-8');
  }

  function csvCell(value) {
    const text = String(value ?? '').replace(/"/g, '""');
    return /[",\n;]/.test(text) ? `"${text}"` : text;
  }

  function downloadFile(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    toast('Arquivo exportado', filename, 'success');
  }

  init();
})();
