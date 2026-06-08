const BASE = '';

function getToken() {
  const t = localStorage.getItem('dck_token');
  const e = localStorage.getItem('dck_expires');
  if (!t || !e) return null;
  if (Date.now() > parseInt(e)) { localStorage.removeItem('dck_token'); localStorage.removeItem('dck_expires'); return null; }
  return t;
}

function setToken(t) {
  localStorage.setItem('dck_token', t);
  // Expire after 24 hours, matching server token TTL
  localStorage.setItem('dck_expires', String(Date.now() + 24 * 60 * 60 * 1000));
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

function apiGet(path) { return api('GET', path); }
function apiPost(path, body) { return api('POST', path, body); }
function apiPut(path, body) { return api('PUT', path, body); }
function apiDelete(path) { return api('DELETE', path); }

let sseSource = null;

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
