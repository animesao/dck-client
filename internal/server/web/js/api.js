const BASE = '';

function getToken() {
  const t = localStorage.getItem('dck_token');
  const e = localStorage.getItem('dck_expires');
  if (!t || !e) return null;
  if (Date.now() > parseInt(e)) { localStorage.removeItem('dck_token'); localStorage.removeItem('dck_expires'); return null; }
  return t;
}

function setToken(t, username, role) {
  localStorage.setItem('dck_token', t);
  localStorage.setItem('dck_expires', String(Date.now() + 24 * 60 * 60 * 1000));
  if (username != null) localStorage.setItem('dck_user', username);
  if (role != null) localStorage.setItem('dck_role', role);
}

async function api(method, path, body) {
  const opts = { method, headers: {} };
  const tok = getToken();
  if (tok) opts.headers['Authorization'] = 'Bearer ' + tok;
  if (body != null) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const r = await fetch(BASE + path, opts);
  const ct = r.headers.get('content-type') || '';
  if (r.status === 401) { localStorage.removeItem('dck_token'); localStorage.removeItem('dck_expires'); window.location.reload(); }
  if (ct.includes('application/json')) return r.json();
  return r.text();
}

let sseSource = null;

/* Project API */
function apiGetCategories() { return apiGet('/api/categories'); }
function apiGetBlueprintsByCategory(cat) { return apiGet('/api/blueprints/category/' + encodeURIComponent(cat)); }
function apiScanProjects() { return apiGet('/api/projects/scan'); }
function apiReadProject(dir) { return apiGet('/api/projects/read?dir=' + encodeURIComponent(dir)); }
function apiCreateProject(data) { return apiPost('/api/projects/create', data); }
function apiSaveProject(dir, config) { return apiPost('/api/projects/save', { dir, config }); }
function apiDeleteProject(dir, removeContainer) { return apiDelete('/api/projects/delete?dir=' + encodeURIComponent(dir) + '&remove_container=' + (removeContainer ? 'true' : 'false')); }
function apiDeployProject(dir, profile) { return apiPost('/api/projects/deploy', { dir, profile }); }
function apiAutoDeploy(profile) { return apiPost('/api/projects/auto-deploy', { profile }); }

function connectSSE(onEvent) {
  if (sseSource) { sseSource.close(); sseSource = null; }
  const tok = getToken();
  const url = BASE + '/api/events' + (tok ? '?token=' + encodeURIComponent(tok) : '');
  sseSource = new EventSource(url);
  sseSource.onmessage = e => {
    try { onEvent(JSON.parse(e.data)); } catch(_) {}
  };
  sseSource.onerror = () => {};
}
