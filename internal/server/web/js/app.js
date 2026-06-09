/* State */
let state = { containers: [], images: [], config: {}, blueprints: [], version: '', dckVersion: '', _stats: {} };
let currentPage = 'dashboard';
let currentDetailId = '';
let logAutoRefresh = true;
let logInterval = null;
let infoInterval = null;
let bpImagesCache = null;

/* Init */
document.addEventListener('DOMContentLoaded', () => {
  if (getToken()) { showMain(); navigate('dashboard'); } else { showLogin(); }
  window.addEventListener('resize', () => { if (termFit) termFit.fit(); });
});

/* Auth */
function showLogin() { document.getElementById('login-screen').style.display = 'flex'; document.getElementById('main-screen').style.display = 'none'; }
function showRegister() { document.getElementById('login-card').style.display = 'none'; document.getElementById('register-form').style.display = 'block'; }
function showLoginForm() { document.getElementById('login-card').style.display = 'block'; document.getElementById('register-form').style.display = 'none'; }

async function login() {
  const u = document.getElementById('login-username').value.trim();
  const p = document.getElementById('login-password').value.trim();
  const err = document.getElementById('login-error');
  if (!u || !p) { err.textContent = 'Fill in all fields'; return; }
  err.textContent = '';
  document.getElementById('login-btn').disabled = true;
  try {
    const r = await apiPost('/api/auth/login', { username: u, password: p });
    if (r.error) { err.textContent = r.error; return; }
    if (r.token) { setToken(r.token, r.username, r.role); showMain(); navigate('dashboard'); }
  } catch(e) { err.textContent = 'Connection error'; }
  finally { document.getElementById('login-btn').disabled = false; }
}

async function register() {
  const u = document.getElementById('reg-username').value.trim();
  const p = document.getElementById('reg-password').value.trim();
  const c = document.getElementById('reg-confirm').value.trim();
  const err = document.getElementById('register-error');
  if (!u || !p || !c) { err.textContent = 'Fill in all fields'; return; }
  if (p !== c) { err.textContent = 'Passwords do not match'; return; }
  err.textContent = '';
  try {
    const r = await apiPost('/api/auth/register', { username: u, password: p });
    if (r.error) { err.textContent = r.error; return; }
    toast('Account created. Sign in.', 'success');
    showLoginForm();
  } catch(e) { err.textContent = 'Connection error'; }
}

function logout() { localStorage.removeItem('dck_token'); localStorage.removeItem('dck_expires'); localStorage.removeItem('dck_user'); localStorage.removeItem('dck_role'); if (sseSource) { sseSource.close(); sseSource = null; } window.location.reload(); }

function showMain() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('main-screen').style.display = 'flex';
  document.getElementById('user-info').textContent = localStorage.getItem('dck_user') || 'User';
  document.getElementById('user-role').textContent = localStorage.getItem('dck_role') || 'admin';
  connectSSE(onSSE);
  checkVersion();
  loadDashboard();
  apiGet('/api/auth/me').then(u => {
    if (u && u.username) {
      localStorage.setItem('dck_user', u.username);
      if (u.role) localStorage.setItem('dck_role', u.role);
      document.getElementById('user-info').textContent = u.username;
      document.getElementById('user-role').textContent = u.role || 'admin';
    }
  }).catch(() => {});
}

/* Toast */
function toast(msg, type, dur) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast ' + (type || '');
  setTimeout(() => t.classList.add('show'), 10);
  clearTimeout(t._hide);
  t._hide = setTimeout(() => t.classList.remove('show'), dur || 3000);
}

/* Navigation */
function navigate(page, data) {
  if (page !== 'container-detail') {
    disconnectConsole();
    clearInterval(infoInterval);
  }
  currentPage = page;
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.page === page));
  document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));

  const titles = { dashboard: 'Dashboard', blueprints: 'Blueprints', containers: 'Containers', images: 'Images', config: 'Config', settings: 'Settings', 'container-detail': 'Container', create: 'Create Container' };
  document.getElementById('page-title').textContent = titles[page] || page;

  const el = document.getElementById('page-' + page);
  if (el) { el.classList.add('active'); }

  if (page === 'dashboard') loadDashboard();
  else if (page === 'blueprints') loadBlueprints();
  else if (page === 'containers') loadContainers();
  else if (page === 'images') loadImages();
  else if (page === 'config') loadConfig();
  else if (page === 'create') loadCreateForm();
  else if (page === 'settings') loadSettings();
  else if (page === 'container-detail' && data) { currentDetailId = data; loadContainerDetail(data); }
}

function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }

/* SSE */
function onSSE(data) {
  const el = document.getElementById('connection-status');
  el.innerHTML = '<span class="status-dot running"></span>Live';
  if (data.type === 'containers' && Array.isArray(data.data)) {
    state.containers = data.data;
    if (currentPage === 'dashboard') updateDashContainerTable(data.data);
    if (currentPage === 'containers') updateContainerTable(data.data);
    if (currentPage === 'container-detail' && currentDetailId) loadDetailInfo(currentDetailId);
    updateStats(data.data);
  }
  if (data.type === 'container_stats' && Array.isArray(data.data)) {
    const statsMap = {};
    data.data.forEach(s => { statsMap[s.id] = s; });
    state._stats = statsMap;
    if (currentPage === 'dashboard') updateDashContainerStats(statsMap);
    if (currentPage === 'container-detail' && currentDetailId) {
      const s = statsMap[currentDetailId];
      if (s) updateDetailStats(s);
    }
  }
}

function updateStats(containers) {
  const total = containers ? containers.length : 0;
  const running = containers ? containers.filter(c => c.status === 'running').length : 0;
  animateNum('stat-containers', total);
  animateNum('stat-running', running);
  animateNum('stat-stopped', total - running);
}

function animateNum(id, target) {
  const el = document.getElementById(id); if (!el) return;
  const curr = parseInt(el.textContent) || 0;
  if (curr === target) return;
  let start = curr, dur = 400, startT = performance.now();
  function step(now) {
    const p = Math.min((now - startT) / dur, 1);
    el.textContent = Math.round(start + (target - start) * p);
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/* Dashboard */
async function loadDashboard() {
  try {
    const [dash, containers] = await Promise.all([apiGet('/api/dashboard/stats'), apiGet('/api/containers?all=true')]);
    state.containers = containers || [];
    renderSysInfo(dash.system_info || {});
    updateStats(state.containers);
    updateDashContainerTable(state.containers);
  } catch(_) {}
}

function renderSysInfo(sys) {
  const el = document.getElementById('sys-info');
  const fields = [
    ['Hostname', sys.hostname || '—'],
    ['OS', sys.os || sys.platform || '—'],
    ['Arch', sys.arch || '—'],
    ['dck Version', sys.dck_version || sys.dckVersion || '—'],
    ['Memory', sys.memory || '—'],
    ['Disk', sys.disk || '—'],
    ['CPU', sys.cpu || '—'],
    ['Uptime', sys.uptime || '—'],
  ];
  el.innerHTML = fields.map(([k,v]) => '<div class="info-item"><strong>' + k + '</strong><span>' + v + '</span></div>').join('');
}

function updateDashContainerTable(containers) {
  const el = document.getElementById('dash-containers');
  if (!containers || containers.length === 0) { el.innerHTML = '<div class="empty-state"><p>No containers</p></div>'; return; }
  const running = containers.filter(c => c.status === 'running').slice(0, 12);
  if (running.length === 0) { el.innerHTML = '<div class="empty-state"><p>No active containers</p></div>'; return; }
  el.innerHTML = '<div class="dash-container-grid">' +
    running.map(c => {
      const cmd = Array.isArray(c.cmd) ? c.cmd.join(' ') : (c.cmd || '—');
      const vols = Array.isArray(c.volumes) ? c.volumes.map(v => (v.source || '') + ':' + (v.target || '')).filter(Boolean).join('<br>') : (c.volumes || '—');
      const envs = Array.isArray(c.env) ? c.env.slice(0, 4).join('<br>') + (c.env.length > 4 ? '<br><span style="color:var(--text2)">+' + (c.env.length - 4) + ' more</span>' : '') : (c.env || '—');
      const img = (c.image_name || c.image || '') + (c.image_tag ? ':' + c.image_tag : '');
      return '<div class="dash-container-card glass" data-container-id="' + esc(c.id) + '" onclick="navigate(\'container-detail\',\'' + esc(c.id) + '\')">' +
        '<div class="dash-card-header"><span class="dash-card-name">' + esc(c.name) + '</span>' + statusBadge(c.status) + '</div>' +
        '<div class="dash-card-id">ID ' + esc(c.id || '') + '</div>' +
        '<div class="dash-card-body">' +
          '<div class="dash-card-row"><span class="dash-label">Image</span><span class="dash-value">' + esc(img) + '</span></div>' +
          '<div class="dash-card-row"><span class="dash-label">Ports</span><span class="dash-value">' + fmtPorts(c.ports) + '</span></div>' +
          (c.ip ? '<div class="dash-card-row"><span class="dash-label">IP</span><span class="dash-value">' + esc(c.ip) + '</span></div>' : '') +
          (c.pid ? '<div class="dash-card-row"><span class="dash-label">PID</span><span class="dash-value">' + c.pid + '</span></div>' : '') +
          (c.hostname ? '<div class="dash-card-row"><span class="dash-label">Hostname</span><span class="dash-value">' + esc(c.hostname) + '</span></div>' : '') +
          '<div class="dash-card-row"><span class="dash-label">Uptime</span><span class="dash-value">' + esc(c.uptime || c.created || '') + '</span></div>' +
          (c.restart ? '<div class="dash-card-row"><span class="dash-label">Restart</span><span class="dash-value">' + esc(c.restart) + '</span></div>' : '') +
          (cmd && cmd !== '—' ? '<div class="dash-card-row"><span class="dash-label">Command</span><span class="dash-value mono" style="font-size:11px">' + esc(cmd) + '</span></div>' : '') +
          '<div class="dash-card-row"><span class="dash-label">CPU</span>' + resBar(c.cpu_percent, c.cpu, 'dash-cpu-bar') + '</div>' +
          '<div class="dash-card-row"><span class="dash-label">RAM</span>' + resBar(c.mem_percent, c.mem, 'dash-mem-bar') + '</div>' +
          (vols && vols !== '—' ? '<div class="dash-card-row"><span class="dash-label">Volumes</span><span class="dash-value" style="font-size:11px">' + vols + '</span></div>' : '') +
          (envs && envs !== '—' ? '<div class="dash-card-row"><span class="dash-label">Env</span><span class="dash-value" style="font-size:11px">' + envs + '</span></div>' : '') +
        '</div></div>';
    }).join('') +
    '</div>';
}

function updateDashContainerStats(statsMap) {
  document.querySelectorAll('.dash-container-card').forEach(card => {
    const id = card.dataset.containerId;
    if (!id) return;
    const s = statsMap[id];
    if (!s) return;
    const cpuEl = card.querySelector('.dash-cpu-bar');
    const memEl = card.querySelector('.dash-mem-bar');
    if (cpuEl) {
      const p = Math.min(s.cpu_percent || 0, 100);
      cpuEl.style.width = p + '%';
      cpuEl.className = 'dash-res-bar ' + (p > 80 ? 'high' : (p > 50 ? 'mid' : 'low'));
      const label = cpuEl.closest('.dash-card-row').querySelector('.dash-value:last-child');
      if (label) label.textContent = (s.cpu || '0') + '%';
    }
    if (memEl) {
      const p = Math.min(s.mem_percent || 0, 100);
      memEl.style.width = p + '%';
      memEl.className = 'dash-res-bar mem ' + (p > 80 ? 'high' : (p > 50 ? 'mid' : 'low'));
      const label = memEl.closest('.dash-card-row').querySelector('.dash-value:last-child');
      if (label) label.textContent = (s.mem || '0');
    }
  });
}

function updateDetailStats(s) {
  const el = document.getElementById('detail-stats');
  if (!el) return;
  if (!s || s.error) {
    el.innerHTML = '<div style="font-size:12px;color:var(--text2);text-align:center;padding:8px">Container not running</div>';
    return;
  }
  el.innerHTML =
    '<div class="res-row"><span class="res-label">CPU</span><div class="res-bar-wrap"><div class="res-bar" style="width:' + Math.min(s.cpu_percent, 100) + '%"></div></div><span class="res-value">' + (s.cpu || '0') + '%</span></div>' +
    '<div class="res-row"><span class="res-label">RAM</span><div class="res-bar-wrap"><div class="res-bar mem" style="width:' + Math.min(s.mem_percent, 100) + '%"></div></div><span class="res-value">' + (s.mem || '0') + '</span></div>';
}

/* Blueprints */
let bpCategories = ['All', 'Web', 'Database', 'Application', 'Game', 'Multi-container'];
let activeBpCat = 'All';
let allBlueprints = [];

async function loadBlueprints() {
  try {
    const catsEl = document.getElementById('bp-categories');
    catsEl.innerHTML = bpCategories.map(c => '<button class="bp-cat-btn' + (c === activeBpCat ? ' active' : '') + '" onclick="setBpCategory(\'' + c + '\')">' + c + '</button>').join('');

    const res = await apiGet('/api/blueprints');
    allBlueprints = Array.isArray(res) ? res : (res.blueprints || []);
    renderBlueprints();
  } catch(_) {}
}

function setBpCategory(cat) {
  activeBpCat = cat;
  document.querySelectorAll('.bp-cat-btn').forEach(el => el.classList.toggle('active', el.textContent === cat));
  renderBlueprints();
}

function getBpIcon(name) {
  const icons = { 'nginx': 'N', 'flask': 'F', 'node': 'N', 'postgres': 'P', 'mysql': 'M', 'redis': 'R', 'discord': 'D', 'telegram': 'T', 'minecraft': 'M' };
  for (const [k,v] of Object.entries(icons)) { if (name.toLowerCase().includes(k)) return v; }
  return name.charAt(0).toUpperCase();
}

function renderBlueprints() {
  const grid = document.getElementById('blueprint-grid');
  let list = allBlueprints;
  if (activeBpCat !== 'All') {
    list = list.filter(b => (b.category || '') === activeBpCat || (b.tags || []).includes(activeBpCat));
  }
  if (list.length === 0) { grid.innerHTML = '<div class="empty-state"><p>No blueprints in this category</p></div>'; return; }
  grid.innerHTML = list.map(b => {
    const tags = b.tags || [];
    const cat = b.category ? [b.category] : [];
    const allTags = [...new Set([...cat, ...tags])];
    return '<div class="bp-card glass" onclick="openBlueprintModal(\'' + esc(b.name) + '\')">' +
      '<div class="bp-card-icon">' + getBpIcon(b.name) + '</div>' +
      '<h3>' + esc(b.name) + '</h3>' +
      '<p>' + esc(b.description || '') + '</p>' +
      '<div class="bp-card-tags">' + allTags.map(t => '<span class="bp-tag">' + esc(t) + '</span>').join('') + '</div>' +
      '</div>';
  }).join('');
}

async function openBlueprintModal(id) {
  const bp = allBlueprints.find(b => b.name === id);
  if (!bp) return;
  const modal = document.getElementById('bp-modal');
  document.getElementById('bp-modal-title').textContent = 'Deploy: ' + bp.name;
  document.getElementById('bp-image').value = bp.image || '';
  document.getElementById('bp-default-port').value = bp.defaultPort || '';
  document.getElementById('bp-default-cmd').value = bp.defaultCmd || '';
  document.getElementById('bp-is-multi').value = bp.isMulti ? 'true' : '';
  document.getElementById('bp-name').value = bp.name.toLowerCase().replace(/[^a-z0-9-]/g, '-') + '-' + randStr(4);
  document.getElementById('bp-port').value = bp.defaultPort || '';
  document.getElementById('bp-restart').value = 'always';
  document.getElementById('bp-cmd').value = bp.defaultCmd || '';
  document.getElementById('bp-volumes').value = (bp.volumes || []).join('\n');

  const envSection = document.getElementById('bp-env-section');
  const envFields = document.getElementById('bp-env-fields');
  const envVars = bp.env || [];
  if (envVars.length > 0) {
    envSection.style.display = 'block';
    envFields.innerHTML = envVars.map((ev, i) =>
      '<div class="env-field-row">' +
      '<div class="env-key">' + esc(ev.key) + (ev.required ? '<span style="color:var(--red)">*</span>' : '') + '</div>' +
      '<div style="flex:1">' +
      '<input type="text" id="bp-env-' + i + '" value="' + esc(ev.default || '') + '" placeholder="' + esc(ev.description || 'Value') + '">' +
      '<div class="env-desc">' + esc(ev.description || '') + '</div>' +
      '</div></div>'
    ).join('');
  } else {
    envSection.style.display = 'none';
    envFields.innerHTML = '';
  }

  const hint = document.getElementById('bp-hint');
  if (bp.hint) { hint.style.display = 'block'; hint.textContent = bp.hint; } else { hint.style.display = 'none'; }

  document.getElementById('bp-output').style.display = 'none';
  document.getElementById('bp-output').className = 'output-box';
  document.getElementById('bp-deploy-btn').querySelector('.btn-text').textContent = 'Pull & Deploy';
  document.getElementById('bp-deploy-btn').querySelector('.btn-spinner').style.display = 'none';
  document.getElementById('bp-deploy-btn').disabled = false;
  modal.style.display = 'flex';
}

function closeBlueprintModal() { document.getElementById('bp-modal').style.display = 'none'; }

async function deployBlueprint(e) {
  e.preventDefault();
  const btn = document.getElementById('bp-deploy-btn');
  const output = document.getElementById('bp-output');
  btn.querySelector('.btn-text').textContent = 'Deploying...';
  btn.querySelector('.btn-spinner').style.display = 'inline-block';
  btn.disabled = true;
  ptClear(output);

  const isMulti = document.getElementById('bp-is-multi').value === 'true';
  const envVars = {};
  const envFields = document.getElementById('bp-env-fields').querySelectorAll('.env-field-row');
  envFields.forEach((row, i) => {
    const key = row.querySelector('.env-key').textContent.replace('*', '').trim();
    const val = document.getElementById('bp-env-' + i).value.trim();
    envVars[key] = val;
  });

  const volumes = document.getElementById('bp-volumes').value.split('\n').map(v => v.trim()).filter(Boolean);
  const memory = document.getElementById('bp-memory').value.trim();
  const cpus = parseFloat(document.getElementById('bp-cpus').value.trim()) || 0;
  const workdir = document.getElementById('bp-workdir').value.trim();
  const payload = {
    name: document.getElementById('bp-name').value.trim(),
    image: document.getElementById('bp-image').value.trim(),
    port: document.getElementById('bp-port').value.trim(),
    command: document.getElementById('bp-cmd').value.trim() || undefined,
    restart: document.getElementById('bp-restart').value || undefined,
    memory: memory || undefined,
    cpus: cpus || undefined,
    workdir: workdir || undefined,
    env: envVars,
    volumes: volumes,
  };

  try {
    ptWrite(output, 'Pulling image and creating container...');
    const bpId = document.getElementById('bp-modal-title').textContent.replace('Deploy: ', '');
    const res = await apiPost('/api/blueprints/' + encodeURIComponent(bpId) + '/launch', payload);
    if (res.error) { output.className = 'output-box error'; ptWrite(output, 'Error: ' + res.error); }
    else {
      ptWrite(output, '✓ Deploy started');
      if (res.results) res.results.forEach(r => ptWrite(output, '  ' + r.name + ': ' + (r.success ? '✓' : '✗ ' + (r.error || ''))));
      if (!res.results || res.results.length === 0) ptWrite(output, '✓ Container created');
      toast('Blueprint deployed', 'success');
    }
  } catch(e) { output.className = 'output-box error'; ptWrite(output, 'Request failed: ' + e.message); }
  finally { btn.querySelector('.btn-text').textContent = 'Done'; btn.querySelector('.btn-spinner').style.display = 'none'; btn.disabled = false; }
}

/* Containers */
async function loadContainers() {
  const all = document.getElementById('show-all').checked;
  const el = document.getElementById('container-list');
  el.innerHTML = '<div class="empty-state"><p>Loading...</p></div>';
  try {
    const containers = await apiGet('/api/containers?all=' + (all ? 'true' : 'false'));
    state.containers = containers || [];
    updateContainerTable(state.containers);
  } catch(_) { el.innerHTML = '<div class="empty-state"><p>Error loading containers</p></div>'; }
}

function updateContainerTable(containers) {
  const el = document.getElementById('container-list');
  if (!containers || containers.length === 0) { el.innerHTML = '<div class="empty-state"><p>No containers</p></div>'; return; }
  const search = (document.getElementById('container-search').value || '').toLowerCase();
  const showAll = document.getElementById('show-all').checked;
  let list = containers;
  if (!showAll) list = list.filter(c => c.status === 'running');
  if (search) list = list.filter(c => (c.name || '').toLowerCase().includes(search) || (c.image_name || '').toLowerCase().includes(search));
  el.innerHTML = '<table><thead><tr><th>Name</th><th>Image</th><th>Status</th><th>Ports</th><th>Created</th><th>Actions</th></tr></thead><tbody>' +
    list.map(c => '<tr>' +
      '<td><a href="#" onclick="navigate(\'container-detail\',\'' + esc(c.id) + '\')" style="color:var(--accent2)">' + esc(c.name) + '</a></td>' +
      '<td>' + esc(c.image_name + (c.image_tag ? ':' + c.image_tag : '')) + '</td>' +
      '<td>' + statusBadge(c.status) + '</td>' +
      '<td>' + fmtPorts(c.ports) + '</td>' +
      '<td>' + esc(c.created_at || '') + '</td>' +
      '<td>' +
      (c.status !== 'running' ? '<button class="action-btn success" onclick="execAction(\'' + esc(c.id) + '\',\'start\')" title="Start">▶</button>' : '') +
      (c.status === 'running' ? '<button class="action-btn danger" onclick="execAction(\'' + esc(c.id) + '\',\'stop\')" title="Stop">■</button>' : '') +
      (c.status === 'running' ? '<button class="action-btn danger" onclick="execAction(\'' + esc(c.id) + '\',\'restart\')" title="Restart">↻</button>' : '') +
      '<button class="action-btn danger" onclick="deleteContainer(\'' + esc(c.id) + '\')" title="Delete">✕</button>' +
      '</td></tr>').join('') +
    '</tbody></table>';
}

function filterContainers() { updateContainerTable(state.containers); }

async function execAction(id, action) {
  try {
    const r = await apiPost('/api/containers/' + encodeURIComponent(id) + '/' + action);
    if (r.error) toast(r.error, 'error');
    else { const c = state.containers.find(x => x.id === id); toast(action + ' ' + (c ? c.name : id), 'success'); }
  } catch(e) { toast('Action failed', 'error'); }
}

async function deleteContainer(id) {
  const c = state.containers.find(x => x.id === id);
  if (!confirm('Delete container "' + (c ? c.name : id) + '"?')) return;
  try {
    const r = await apiDelete('/api/containers/' + encodeURIComponent(id));
    if (r.error) toast(r.error, 'error');
    else { toast('Deleted ' + (c ? c.name : id), 'success'); loadContainers(); }
  } catch(e) { toast('Delete failed', 'error'); }
}

function showCreateContainer() { navigate('create'); }

function loadCreateForm() {
  document.getElementById('cr-image').value = '';
  document.getElementById('cr-name').value = '';
  document.getElementById('cr-restart').value = 'always';
  document.getElementById('cr-memory').value = '';
  document.getElementById('cr-cpus').value = '';
  document.getElementById('cr-port').value = '';
  document.getElementById('cr-hostname').value = '';
  document.getElementById('cr-workdir').value = '';
  document.getElementById('cr-cmd').value = '';
  document.getElementById('cr-env').value = '';
  document.getElementById('cr-volumes').value = '';
  document.getElementById('cr-output').style.display = 'none';
  document.getElementById('cr-btn').disabled = false;
  document.getElementById('cr-btn').querySelector('.btn-text').textContent = 'Create & Start';
  document.getElementById('cr-btn').querySelector('.btn-spinner').style.display = 'none';
}

async function createCustomContainer(e) {
  e.preventDefault();
  const btn = document.getElementById('cr-btn');
  const output = document.getElementById('cr-output');
  ptClear(output);
  btn.querySelector('.btn-text').textContent = 'Creating...';
  btn.querySelector('.btn-spinner').style.display = 'inline-block';
  btn.disabled = true;
  output.style.display = 'none';

  const image = document.getElementById('cr-image').value.trim();
  if (!image) { toast('Image is required', 'error'); btn.disabled = false; btn.querySelector('.btn-text').textContent = 'Create & Start'; btn.querySelector('.btn-spinner').style.display = 'none'; return; }

  const envRaw = document.getElementById('cr-env').value.trim();
  const envList = envRaw ? envRaw.split('\n').map(s => s.trim()).filter(Boolean) : [];
  const vols = document.getElementById('cr-volumes').value.split('\n').map(v => v.trim()).filter(Boolean);
  const memory = document.getElementById('cr-memory').value.trim();
  const cpus = parseFloat(document.getElementById('cr-cpus').value.trim()) || 0;
  const workdir = document.getElementById('cr-workdir').value.trim();

  try {
    ptWrite(output, 'Pulling image...');
    output.style.display = 'block';
    await apiPost('/api/images/pull', { image: image });
    ptWrite(output, 'Creating container...');
    const res = await apiPost('/api/containers', {
      image: image,
      name: document.getElementById('cr-name').value.trim() || undefined,
      restart: document.getElementById('cr-restart').value || undefined,
      ports: splitCSV(document.getElementById('cr-port').value.trim()),
      hostname: document.getElementById('cr-hostname').value.trim() || undefined,
      command: document.getElementById('cr-cmd').value.trim() || undefined,
      memory: memory || undefined,
      cpus: cpus || undefined,
      workdir: workdir || undefined,
      env: envList,
      volumes: vols,
      detach: true,
    });
    if (res.error) { output.className = 'output-box error'; ptWrite(output, 'Error: ' + res.error); toast('Create failed', 'error'); }
    else {
      ptWrite(output, '✓ Container created and started');
      toast('Container created', 'success');
      setTimeout(() => navigate('containers'), 1500);
    }
  } catch(e) { output.className = 'output-box error'; ptWrite(output, 'Request failed: ' + e.message); toast('Create failed', 'error'); }
  finally { btn.querySelector('.btn-text').textContent = 'Create & Start'; btn.querySelector('.btn-spinner').style.display = 'none'; btn.disabled = false; }
}

/* Container Detail */
async function loadContainerDetail(id) {
  const c = state.containers.find(x => x.id === id) || {};
  document.getElementById('detail-title').textContent = c.name || id;
  switchDetailTab('info');
  await loadDetailInfo(id);
  await loadDetailLogs(id);
  await loadDetailState(id);
}

async function loadDetailInfo(id) {
  const el = document.getElementById('detail-info');
  try {
    const c = await apiGet('/api/containers/' + encodeURIComponent(id));
    if (!c || c.error) { el.innerHTML = '<div class="empty-state"><p>Error loading container</p></div>'; return; }
    const cmd = Array.isArray(c.cmd) ? c.cmd.join(' ') : (c.cmd || '—');
    const vols = Array.isArray(c.volumes) ? c.volumes.map(v => (v.source || '') + ':' + (v.target || '')).filter(Boolean).join(', ') : (c.volumes || '—');
    const envs = Array.isArray(c.env) ? c.env.join(', ') : (c.env || '—');
    const statusClass = c.status === 'running' ? 'status-running' : (c.status === 'stopped' ? 'status-stopped' : '');
    const uptime = c.created_at ? fmtUptime(c.created_at) : '—';
    var netField = '';
    if (c.ip) netField = 'IP';
    el.innerHTML = '<div class="info-grid">' +
      [
        ['ID', '<code style="font-size:11px">' + esc(c.id) + '</code>'],
        ['Name', esc(c.name)],
        ['Image', esc((c.image_name || '') + (c.image_tag ? ':' + c.image_tag : ''))],
        ['Status', '<span class="' + statusClass + '">' + esc(c.status) + '</span>'],
        ['Uptime', uptime],
        ['PID', c.pid > 0 ? c.pid : '—'],
        [netField, c.ip || '—'],
        ['Ports', fmtPorts(c.ports)],
        ['Hostname', esc(c.hostname || '—')],
        ['Restart', esc(c.restart || '—')],
        ['Command', esc(cmd)],
        ['Working Dir', esc(c.working_dir || '—')],
        ['Memory Limit', c.memory_limit ? c.memory_limit + ' bytes' : '—'],
        ['CPUs', c.cpu_count ? String(c.cpu_count) : '—'],
        ['Volumes', esc(vols)],
        ['Environment', esc(envs)],
        ['Auto Remove', c.remove_on_exit ? 'Yes' : 'No'],
      ].filter(([k]) => k).map(([k,v]) => '<div class="info-item"><strong>' + k + '</strong><span>' + v + '</span></div>').join('') +
      '</div>' +
      '<div id="detail-stats" class="detail-stats" style="margin-top:16px"><h3 style="font-size:14px;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">Resource Usage</h3><div class="empty-state"><p>' + (c.status === 'running' ? 'Loading stats...' : 'Container not running') + '</p></div></div>';
    if (c.status === 'running') loadDetailStats(id);
  } catch(_) { el.innerHTML = '<div class="empty-state"><p>Error</p></div>'; }
}

async function loadDetailStats(id) {
  const el = document.getElementById('detail-stats');
  if (!el) return;
  try {
    const r = await apiGet('/api/containers/' + encodeURIComponent(id) + '/stats');
    if (r && r.error === 'container not running') {
      el.innerHTML = '<div style="font-size:12px;color:var(--text2);text-align:center;padding:8px">Container is not running</div>';
      return;
    }
    if (r.error) { el.innerHTML = '<div style="font-size:12px;color:var(--text2)">' + esc(r.error) + '</div>'; return; }
    el.innerHTML =
      '<div class="res-row"><span class="res-label">CPU</span><div class="res-bar-wrap"><div class="res-bar" style="width:' + Math.min(r.cpu_percent, 100) + '%"></div></div><span class="res-value">' + (r.cpu || '0') + '%</span></div>' +
      '<div class="res-row"><span class="res-label">RAM</span><div class="res-bar-wrap"><div class="res-bar mem" style="width:' + Math.min(r.mem_percent, 100) + '%"></div></div><span class="res-value">' + (r.mem || '0') + '</span></div>';
  } catch(_) { el.innerHTML = '<div style="font-size:12px;color:var(--text2)">Stats unavailable</div>'; }
}

async function loadDetailLogs(id) {
  const el = document.getElementById('log-viewer');
  try {
    const r = await apiGet('/api/containers/' + encodeURIComponent(id) + '/logs');
    const text = typeof r === 'string' ? r : (r.logs || 'No logs');
    el.innerHTML = '';
    text.split('\n').forEach(l => ptWrite(el, l));
  } catch(_) { el.innerHTML = ''; ptWrite(el, 'Error loading logs'); }
}

async function loadDetailState(id) {
  const el = document.getElementById('state-viewer');
  try {
    const r = await apiGet('/api/containers/' + encodeURIComponent(id) + '/state');
    const text = typeof r === 'string' ? r : JSON.stringify(r, null, 2);
    el.innerHTML = '';
    text.split('\n').forEach(l => ptWrite(el, l));
  } catch(_) { el.innerHTML = ''; ptWrite(el, 'Error loading state'); }
}

function switchDetailTab(tab) {
  if (tab !== 'console') disconnectConsole();
  document.querySelectorAll('.detail-tabs .tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.getElementById('detail-' + tab).classList.add('active');
  if (tab === 'console') {
    setTimeout(() => { if (termFit) termFit.fit(); connectConsole(); }, 50);
  }
  // Auto‑refresh info tab; stats come via SSE in real‑time
  if (tab === 'info') {
    infoInterval = setInterval(() => loadDetailInfo(currentDetailId), 4000);
    loadDetailInfo(currentDetailId);
  } else {
    clearInterval(infoInterval);
  }
  if (tab === 'logs') {
    startLogAutoRefresh();
  } else {
    clearInterval(logInterval);
  }
}


function refreshLogs() { loadDetailLogs(currentDetailId); }

function toggleAutoRefresh() {
  logAutoRefresh = !logAutoRefresh;
  document.getElementById('auto-refresh-btn').textContent = 'Auto: ' + (logAutoRefresh ? 'ON' : 'OFF');
  if (logAutoRefresh) {
    logInterval = setInterval(() => loadDetailLogs(currentDetailId), 3000);
  } else {
    clearInterval(logInterval);
  }
}

// Start auto-refresh for logs when viewing container detail
function startLogAutoRefresh() {
  if (logAutoRefresh) {
    logInterval = setInterval(() => loadDetailLogs(currentDetailId), 3000);
  }
}

/* Console */
let terminal = null;
let termFit = null;
let wsConsole = null;

function sendCommand() {
  const input = document.getElementById('console-command');
  const cmd = input.value.trim();
  if (!cmd || !wsConsole || wsConsole.readyState !== WebSocket.OPEN) return;
  input.value = '';
  terminal.write('\r\n\x1b[1;36m> ' + esc(cmd) + '\x1b[0m\r\n');
  wsConsole.send(cmd + '\r');
  terminal.focus();
}

function connectConsole() {
  if (wsConsole && wsConsole.readyState === WebSocket.OPEN) return;
  const id = currentDetailId;
  if (!id) return;
  const container = document.getElementById('terminal-container');
  const connBtn = document.getElementById('console-connect-btn');
  const disBtn = document.getElementById('console-disconnect-btn');

  if (terminal) { terminal.dispose(); terminal = null; }
  terminal = new Terminal({ cursorBlink: true, fontSize: 13, fontFamily: "'SF Mono','Cascadia Code','JetBrains Mono',monospace", convertEOL: true, theme: { background: '#0a0e1a', foreground: '#e2e8f0', cursor: '#6366f1', selectionBackground: 'rgba(99,102,241,0.3)' } });
  termFit = new FitAddon.FitAddon();
  terminal.loadAddon(termFit);
  terminal.open(container);
  termFit.fit();

  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const tok = getToken();
  const url = proto + '//' + location.host + '/api/console/' + encodeURIComponent(id) + '?token=' + encodeURIComponent(tok);

  connBtn.style.display = 'none';
  disBtn.style.display = 'inline-flex';
  document.getElementById('console-input-bar').style.display = 'flex';
  document.getElementById('console-command').focus();

  try {
    wsConsole = new WebSocket(url);
    wsConsole.onopen = () => { terminal.write('\r\n\x1b[1;32m[' + ptTS() + '] Connecting...\x1b[0m\r\n'); };
      wsConsole.onmessage = (e) => {
        const write = (txt) => {
          txt = txt.replace(/\n/g, '\r\n');
          if (txt.length > 0 && txt[0] !== '\r') txt = '\r' + txt;
          terminal.write(txt);
        };
        if (e.data instanceof Blob) {
          e.data.text().then(write);
        } else {
          write(e.data);
        }
      };
    wsConsole.onerror = () => { terminal.write('\r\n\x1b[1;31m[' + ptTS() + '] WebSocket error\x1b[0m\r\n'); };
    wsConsole.onclose = () => { terminal.write('\r\n\x1b[1;33m[' + ptTS() + '] Disconnected\x1b[0m\r\n'); connBtn.style.display = 'inline-flex'; disBtn.style.display = 'none'; document.getElementById('console-input-bar').style.display = 'none'; };

    terminal.onData(data => { if (wsConsole && wsConsole.readyState === WebSocket.OPEN) wsConsole.send(data); });
    terminal.onResize(() => { if (termFit) termFit.fit(); });
  } catch(e) { terminal.write('\r\n\x1b[1;31mConnection failed: ' + e.message + '\x1b[0m\r\n'); }
}

function disconnectConsole() {
  if (wsConsole) { wsConsole.close(); wsConsole = null; }
  document.getElementById('console-connect-btn').style.display = 'inline-flex';
  document.getElementById('console-disconnect-btn').style.display = 'none';
  document.getElementById('console-input-bar').style.display = 'none';
}

/* Images */
async function loadImages() {
  const el = document.getElementById('images-list');
  try {
    const images = await apiGet('/api/images');
    state.images = images || [];
    animateNum('stat-images', state.images.length);
    if (state.images.length === 0) { el.innerHTML = '<div class="empty-state"><p>No images</p></div>'; return; }
    el.innerHTML = '<table><thead><tr><th>Repository</th><th>Tag</th><th>Size</th><th></th></tr></thead><tbody>' +
      state.images.map(img => '<tr>' +
        '<td>' + esc(img.name || '—') + '</td>' +
        '<td>' + esc(img.tag || 'latest') + '</td>' +
        '<td>' + esc(img.size || '') + '</td>' +
        '<td><button class="action-btn danger" onclick="deleteImage(\'' + esc(img.name) + '\',\'' + esc(img.tag || 'latest') + '\')">✕</button></td></tr>').join('') +
      '</tbody></table>';
  } catch(_) { el.innerHTML = '<div class="empty-state"><p>Error</p></div>'; }
}

async function deleteImage(name, tag) {
  if (!confirm('Delete image ' + (name + ':' + tag) + '?')) return;
  try {
    const r = await apiDelete('/api/images/' + encodeURIComponent(name) + '/' + encodeURIComponent(tag));
    if (r.error) toast(r.error, 'error');
    else { toast('Image deleted', 'success'); loadImages(); }
  } catch(e) { toast('Delete failed', 'error'); }
}

function togglePullForm() {
  const el = document.getElementById('pull-form');
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

async function pullImage() {
  const ref = document.getElementById('pull-reference').value.trim();
  if (!ref) return;
  const output = document.getElementById('pull-output');
  ptClear(output);
  ptWrite(output, 'Pulling ' + ref + '...');
  try {
    const r = await apiPost('/api/images/pull', { reference: ref });
    if (r.error) { output.className = 'output-box error'; ptWrite(output, 'Error: ' + r.error); }
    else { ptWrite(output, '✓ Image pulled successfully'); toast('Image pulled', 'success'); loadImages(); }
  } catch(e) { output.className = 'output-box error'; ptWrite(output, 'Request failed'); }
}

/* Config */
async function loadConfig() {
  const el = document.getElementById('config-editor');
  const path = document.getElementById('config-path');
  el.value = 'Loading...';
  try {
    const r = await apiGet('/api/config');
    if (r.error) { el.value = 'Error: ' + r.error; return; }
    state.config = r;
    path.textContent = r.path || '—';
    el.value = r.content || '';
  } catch(e) { el.value = 'Error loading config'; }
}

async function saveConfig() {
  const content = document.getElementById('config-editor').value;
  const output = document.getElementById('config-output');
  ptClear(output);
  ptWrite(output, 'Saving...');
  try {
    const r = await apiPut('/api/config', { content });
    if (r.error) { output.className = 'output-box error'; ptWrite(output, 'Error: ' + r.error); }
    else { ptWrite(output, '✓ Config saved'); toast('Config saved', 'success'); }
  } catch(e) { output.className = 'output-box error'; ptWrite(output, 'Save failed'); }
}

async function deployConfig() {
  const output = document.getElementById('config-output');
  ptClear(output);
  ptWrite(output, 'Deploying...');
  try {
    const r = await apiPost('/api/config/deploy');
    if (r.error) { output.className = 'output-box error'; ptWrite(output, 'Error: ' + r.error); }
    else { ptWrite(output, '✓ ' + (r.message || 'Config deployed')); toast('Config deployed', 'success'); }
  } catch(e) { output.className = 'output-box error'; ptWrite(output, 'Deploy failed'); }
}

async function downConfig() {
  if (!confirm('Stop all containers defined in config?')) return;
  const output = document.getElementById('config-output');
  ptClear(output);
  ptWrite(output, 'Stopping...');
  try {
    const r = await apiPost('/api/config/down');
    if (r.error) { output.className = 'output-box error'; ptWrite(output, 'Error: ' + r.error); }
    else { ptWrite(output, '✓ ' + (r.message || 'Config down')); toast('Config down', 'success'); }
  } catch(e) { output.className = 'output-box error'; ptWrite(output, 'Down failed'); }
}

/* Settings */
async function loadSettings() {
  const u = localStorage.getItem('dck_user') || 'User';
  document.getElementById('user-info').textContent = u;
  document.getElementById('user-role').textContent = 'admin';
  try {
    const r = await apiGet('/api/settings');
    if (r.error) return;
    document.getElementById('set-dck-bin').value = r.dck_binary_path || r.dckBin || '';
    document.getElementById('set-dck-data').value = r.dck_data_dir || r.dckData || '';
    document.getElementById('set-reg-open').checked = r.registration_open !== undefined ? r.registration_open : (r.allowRegistration || false);
  } catch(_) {}
}

async function updateSettings(e) {
  e.preventDefault();
  const payload = {
    dck_binary_path: document.getElementById('set-dck-bin').value.trim(),
    dck_data_dir: document.getElementById('set-dck-data').value.trim(),
    registration_open: document.getElementById('set-reg-open').checked,
  };
  try {
    const r = await apiPut('/api/settings', payload);
    if (r.error) toast(r.error, 'error');
    else toast('Settings saved', 'success');
  } catch(e) { toast('Save failed', 'error'); }
}

/* Version */
async function checkVersion() {
  const badge = document.getElementById('version-badge');
  const currEl = document.getElementById('ver-current');
  const latEl = document.getElementById('ver-latest');
  const dckVerEl = document.getElementById('ver-dck');
  const dckLatEl = document.getElementById('ver-dck-latest');
  const dckUpdateBtn = document.getElementById('dck-update-btn');
  const clientUpdateBtn = document.getElementById('client-update-btn');
  if (!badge) return;
  badge.textContent = '...';
  badge.className = 'version-badge';
  try {
    const r = await apiGet('/api/version');
    const current = r.current || r.version || '—';
    const latest = r.latest || r.latestVersion || '';
    badge.textContent = 'v' + current;
    if (currEl) currEl.textContent = 'v' + current;
    if (latEl) latEl.textContent = latest ? 'v' + latest : '—';
    if (latest && current !== latest && current !== '—') {
      badge.className = 'version-badge update-available';
      badge.title = 'Update available: v' + latest;
    }
    const dckVer = r.dck_version || r.dckVersion || '—';
    const dckLat = r.dck_latest || r.dckLatest || '';
    if (dckVerEl) dckVerEl.textContent = dckVer;
    if (dckLatEl) dckLatEl.textContent = dckLat ? 'v' + dckLat : '—';
    if (dckUpdateBtn) {
      dckUpdateBtn.style.display = (dckLat && dckVer !== '—' && dckVer !== dckLat) ? 'inline-flex' : 'none';
    }
    if (clientUpdateBtn) {
      clientUpdateBtn.style.display = (latest && current !== '—' && current !== latest) ? 'inline-flex' : 'none';
    }
    state.dckVersion = dckVer;
  } catch(_) { badge.textContent = '—'; badge.className = 'version-badge'; }
}

async function updateDckClient() {
  if (!confirm('Download and install latest dck-client version? This will replace the current binary and restart the service.')) return;
  const btn = document.getElementById('client-update-btn');
  const origText = btn.textContent;
  btn.textContent = 'Updating...';
  btn.disabled = true;
  try {
    const r = await apiPost('/api/dck-client/update');
    if (r.error) { toast('Update failed: ' + r.error, 'error'); }
    else { toast('dck-client updated to ' + (r.version || 'latest') + ' — please restart the service', 'success'); checkVersion(); }
  } catch(e) { toast('Update failed', 'error'); }
  finally { btn.textContent = origText; btn.disabled = false; }
}

async function updateDck() {
  if (!confirm('Download and install latest dck version? This will replace the current dck binary.')) return;
  const btn = document.getElementById('dck-update-btn');
  const origText = btn.textContent;
  btn.textContent = 'Updating...';
  btn.disabled = true;
  try {
    const r = await apiPost('/api/dck/update');
    if (r.error) { toast('Update failed: ' + r.error, 'error'); }
    else { toast('dck updated to ' + (r.version || 'latest'), 'success'); checkVersion(); }
  } catch(e) { toast('Update failed', 'error'); }
  finally { btn.textContent = origText; btn.disabled = false; }
}

/* Pterodactyl-style output */
function ptTS() { const d=new Date(); return ('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2)+':'+('0'+d.getSeconds()).slice(-2); }
function ptWrite(el, text) {
  text.split('\n').forEach(l => {
    const d = document.createElement('div');
    d.className = 'pt-l';
    d.innerHTML = '<span class="pt-t">['+ptTS()+']</span><span class="pt-m">'+(l||' ')+'</span>';
    el.appendChild(d);
  });
  el.scrollTop = el.scrollHeight;
}
function ptClear(el) { el.innerHTML = ''; el.className = 'output-box'; el.style.display = 'block'; }

/* Resource bar helper */
function resBar(percent, label, clsName) {
  const p = parseFloat(percent);
  if (isNaN(p) || p < 0) return '<span class="dash-value" style="color:var(--text2)">—</span>';
  const w = Math.min(p, 100);
  const cls = p > 80 ? 'high' : (p > 50 ? 'mid' : 'low');
  return '<div class="dash-res-bar-wrap"><div class="dash-res-bar ' + cls + (clsName ? ' ' + clsName : '') + '" style="width:' + w + '%"></div></div><span class="dash-value" style="font-size:11px;font-family:monospace">' + esc(label || '') + '</span>';
}

/* Helpers */
function fmtUptime(created) {
  var t = new Date(created);
  if (isNaN(t.getTime())) return '—';
  var diff = Math.floor((Date.now() - t.getTime()) / 1000);
  if (diff < 0) return 'just now';
  var d = Math.floor(diff / 86400); diff -= d * 86400;
  var h = Math.floor(diff / 3600); diff -= h * 3600;
  var m = Math.floor(diff / 60); diff -= m * 60;
  var s = diff;
  var parts = [];
  if (d > 0) parts.push(d + 'd');
  if (h > 0 || d > 0) parts.push(h + 'h');
  if (m > 0 || h > 0 || d > 0) parts.push(m + 'm');
  parts.push(s + 's');
  return parts.join(' ');
}
function esc(s) { if (s == null) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function statusBadge(s) { if (!s) return ''; const cls = s === 'running' ? 'running' : (s === 'stopped' ? 'stopped' : 'exited'); return '<span class="status-badge-sm ' + cls + '"><span class="status-dot"></span>' + esc(s) + '</span>'; }
function fmtPorts(ports) { if (!ports) return ''; if (typeof ports === 'string') return ports; if (Array.isArray(ports)) return ports.map(p => (p.host_port || p.hostPort || '') + ':' + (p.container_port || p.containerPort || '') + (p.protocol && p.protocol !== 'tcp' ? '/' + p.protocol : '')).join(', '); return String(ports); }
function randStr(n) { const c='abcdefghijklmnopqrstuvwxyz0123456789'; let r=''; for(let i=0;i<n;i++) r+=c[Math.floor(Math.random()*c.length)]; return r; }
function splitCSV(s) { if (!s) return []; return s.split(',').map(x => x.trim()).filter(Boolean); }
