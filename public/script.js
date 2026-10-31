const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (t) => (t ? new Date(t).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '');
const empty = (msg) => `<div class="empty">${esc(msg)}</div>`;

const TITLES = { dashboard: 'Tableau de bord', citizens: 'Citoyens', vehicles: 'Véhicules', reports: 'Rapports', warrants: 'Avis de recherche', accounts: 'Comptes' };
let token = '';
try { token = sessionStorage.getItem('mdt-token') || ''; } catch (e) {}
let state = { user: null, view: null, citizen: null, warrants: [], reports: [] };
let toastTimer;
const frame = $('#games');

/* ---------- API ---------- */
async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch('/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Erreur (' + res.status + ').');
    err.status = res.status;
    throw err;
  }
  return data;
}
function setToken(t) {
  token = t || '';
  try { token ? sessionStorage.setItem('mdt-token', token) : sessionStorage.removeItem('mdt-token'); } catch (e) {}
}
function onError(e) {
  if (e.status === 401) { setToken(''); setView('gate'); $('#lErr').textContent = e.message; }
  else toast(e.message || 'Erreur réseau.');
}

/* ---------- Écrans : jeux -> connexion -> MDT ---------- */
function setView(v) {
  state.view = v;
  frame.classList.toggle('hidden', v !== 'games');
  $('#gate').classList.toggle('hidden', v !== 'gate');
  $('#app').classList.toggle('hidden', v !== 'app');
  if (v === 'games') setTimeout(() => frame.contentWindow && frame.contentWindow.focus(), 50);
  if (v === 'gate') { showGate('login'); $('#lUser').focus(); }
}
function showGate(which) {
  $('#loginForm').classList.toggle('hidden', which !== 'login');
  $('#signupForm').classList.toggle('hidden', which !== 'signup');
  $('#lErr').textContent = $('#sErr').textContent = '';
  $('#lPass').value = $('#sPass').value = $('#sPass2').value = '';
}
$('#toSignup').addEventListener('click', () => { showGate('signup'); $('#sUser').focus(); });
$('#toLogin').addEventListener('click', () => { showGate('login'); $('#lUser').focus(); });
$('#gateBack1').addEventListener('click', () => setView('games'));
$('#gateBack2').addEventListener('click', () => setView('games'));

function afterAuth(res) {
  setToken(res.token);
  state.user = res.user;
  if (res.user.approved) return enterMdt();
  setView('gate');
  $('#lErr').textContent = 'Compte en attente de validation par un administrateur. Revenez plus tard.';
}

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#lErr').textContent = '';
  try { afterAuth(await api('/login', { method: 'POST', body: { username: $('#lUser').value, password: $('#lPass').value } })); }
  catch (err) { $('#lErr').textContent = err.message; $('#lPass').value = ''; }
});
$('#signupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#sErr'); err.textContent = '';
  if ($('#sPass').value !== $('#sPass2').value) { err.textContent = 'Les deux mots de passe ne sont pas identiques.'; return; }
  try { afterAuth(await api('/signup', { method: 'POST', body: { username: $('#sUser').value, password: $('#sPass').value } })); }
  catch (ex) { err.textContent = ex.message; }
});

async function tryEnter() {
  if (!token) return setView('gate');
  try {
    const { user } = await api('/me');
    state.user = user;
    if (user.approved) await enterMdt();
    else { setView('gate'); $('#lErr').textContent = 'Compte en attente de validation par un administrateur.'; }
  } catch (e) { onError(e); }
}

async function enterMdt() {
  const u = state.user;
  $('#officerName').textContent = u.username;
  $('#officerGrade').textContent = u.admin ? 'Administrateur' : 'Agent';
  $('#navAccounts').classList.toggle('hidden-nav', !u.admin);
  $('#reportResults').dataset.searched = '';
  try { await loadDashboard(); } catch (e) { return onError(e); }
  show('dashboard');
  setView('app');
}

$('#logoutBtn').addEventListener('click', () => { setToken(''); state.user = null; setView('games'); });
$('#closeBtn').addEventListener('click', () => setView('games'));

/* ---------- Navigation ---------- */
function show(view) {
  $$('.view').forEach((v) => v.classList.toggle('hidden', v.id !== `view-${view}`));
  $$('.rail nav button').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  $('#title').textContent = TITLES[view];
  const run = { dashboard: loadDashboard, warrants: loadDashboard, citizens: loadCitizens, vehicles: loadVehicles, reports: loadReports, accounts: loadAccounts }[view];
  if (run) run().catch(onError);
}
$$('.rail nav button').forEach((b) => b.addEventListener('click', () => show(b.dataset.view)));
document.addEventListener('keyup', (e) => {
  if (e.key !== 'Escape') return;
  if (state.view === 'gate' || state.view === 'app') setView('games');
});

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 3500);
}

/* ---------- Rendu ---------- */
const isAdmin = () => !!(state.user && state.user.admin);

function warrantCard(w) {
  const del = isAdmin() ? `<button class="ghost small" data-delw="${esc(w.id)}">Lever l'avis</button>` : '';
  return `<div class="card wanted"><h3>${esc(w.name)}</h3><p>${esc(w.reason)}</p>
    <div class="meta"><span>${esc(w.author)} · ${fmtDate(w.created)}</span>${del}</div></div>`;
}
function reportCard(r) {
  return `<div class="card"><h3>${esc(r.title)}</h3><p>${esc(r.content)}</p>
    <div class="meta"><span>${esc(r.author)}</span><span>${fmtDate(r.created)}</span></div></div>`;
}

async function loadDashboard() {
  const d = await api('/dashboard');
  state.warrants = d.warrants; state.reports = d.reports;
  const w = state.warrants.map(warrantCard).join('') || empty('Aucun avis de recherche actif.');
  $('#dashWarrants').innerHTML = state.warrants.slice(0, 6).map(warrantCard).join('') || empty('Aucun avis de recherche actif.');
  $('#warrantList').innerHTML = w;
  $('#dashReports').innerHTML = state.reports.slice(0, 6).map(reportCard).join('') || empty('Aucun rapport enregistré.');
}

async function loadCitizens() {
  const q = $('#view-citizens .search input').value;
  const { citizens } = await api('/citizens?q=' + encodeURIComponent(q));
  $('#citizenResults').innerHTML = citizens.length
    ? citizens.map((c) => `<div class="card click" data-cid="${esc(c.id)}" data-name="${esc(c.name)}" data-meta="${esc([c.dob, c.notes].filter(Boolean).join(' · '))}">
        <h3>${esc(c.name)}</h3><p class="muted">${esc(c.dob || 'Date de naissance inconnue')}</p></div>`).join('')
    : empty('Aucun citoyen trouvé.');
}
async function loadRecords() {
  if (!state.citizen) return;
  const { records } = await api('/records?citizen=' + encodeURIComponent(state.citizen.id));
  $('#recordList').innerHTML = records.length
    ? records.map((r) => `<div class="card"><h3><span class="tag ${esc(r.type)}">${esc(r.type)}</span> ${esc(r.title)}${r.amount ? ` — ${Number(r.amount).toLocaleString('fr-FR')} $` : ''}</h3>
        ${r.details ? `<p>${esc(r.details)}</p>` : ''}
        <div class="meta"><span>${esc(r.author)}</span><span>${fmtDate(r.created)}</span></div></div>`).join('')
    : empty('Casier vierge.');
}
async function loadVehicles() {
  const q = $('#view-vehicles .search input').value;
  const { vehicles } = await api('/vehicles?q=' + encodeURIComponent(q));
  $('#vehicleResults').innerHTML = vehicles.length
    ? vehicles.map((v) => `<div class="card"><h3>${esc(v.plate)}</h3><p>${esc(v.owner || 'Propriétaire inconnu')}</p>
        ${v.model ? `<div class="meta"><span>${esc(v.model)}</span></div>` : ''}</div>`).join('')
    : empty('Aucun véhicule trouvé.');
}
async function loadReports() {
  const q = $('#view-reports .search input').value;
  const { reports } = await api('/reports?q=' + encodeURIComponent(q));
  $('#reportResults').innerHTML = reports.length ? reports.map(reportCard).join('') : empty('Aucun rapport trouvé.');
}
async function loadAccounts() {
  if (!isAdmin()) return;
  const q = $('#view-accounts .search input').value;
  const { accounts } = await api('/accounts?q=' + encodeURIComponent(q));
  $('#accountResults').innerHTML = accounts.length
    ? accounts.map((a) => {
        const self = a.id === state.user.id;
        const tag = a.admin ? '<span class="tag admin">admin</span>' : a.approved ? '<span class="tag ok">validé</span>' : '<span class="tag wait">en attente</span>';
        const btns = self ? '' : `<span class="btns">
            ${a.approved ? `<button class="ghost small" data-acc="revoke" data-id="${esc(a.id)}">Révoquer</button>` : `<button class="ghost small" data-acc="approve" data-id="${esc(a.id)}">Valider</button>`}
            <button class="ghost small" data-acc="delete" data-id="${esc(a.id)}">Supprimer</button></span>`;
        return `<div class="card"><h3>${esc(a.username)} ${tag}</h3>
          <div class="meta"><span>Créé le ${fmtDate(a.created)} · dernière connexion ${fmtDate(a.lastLogin) || 'jamais'}</span>${btns}</div></div>`;
      }).join('')
    : empty('Aucun compte.');
}

/* ---------- Actions ---------- */
document.addEventListener('click', async (e) => {
  try {
    const dw = e.target.closest('[data-delw]');
    if (dw) { await api('/warrants/' + dw.dataset.delw, { method: 'DELETE' }); toast('Avis de recherche levé.'); await loadDashboard(); return; }
    const acc = e.target.closest('[data-acc]');
    if (acc) {
      const { acc: act, id } = acc.dataset;
      if (act === 'delete') {
        if (!confirm('Supprimer ce compte ?')) return;
        await api('/accounts/' + id, { method: 'DELETE' });
      } else await api(`/accounts/${id}/${act}`, { method: 'POST' });
      toast('Compte mis à jour.'); await loadAccounts();
    }
  } catch (err) { onError(err); }
});

$$('.search').forEach((f) =>
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const run = { citizen: loadCitizens, vehicle: loadVehicles, report: loadReports, account: loadAccounts }[f.dataset.kind];
    run().catch(onError);
  }));

$('#citizenResults').addEventListener('click', (e) => {
  const c = e.target.closest('[data-cid]');
  if (!c) return;
  state.citizen = { id: c.dataset.cid, name: c.dataset.name };
  $('#cName').textContent = c.dataset.name;
  $('#cMeta').textContent = c.dataset.meta;
  $('#citizenDetail').classList.remove('hidden');
  $('#recordList').innerHTML = '';
  loadRecords().catch(onError);
});

/* ---------- Formulaires ---------- */
$('#citizenForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/citizens', { method: 'POST', body: { name: $('#ncName').value, dob: $('#ncDob').value, notes: $('#ncNotes').value } });
    $('#ncName').value = $('#ncDob').value = $('#ncNotes').value = '';
    toast('Citoyen ajouté.'); await loadCitizens();
  } catch (err) { onError(err); }
});
$('#recordForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!state.citizen) return;
  try {
    await api('/records', { method: 'POST', body: { citizen: state.citizen.id, type: $('#rType').value, amount: $('#rAmount').value, title: $('#rTitle').value, details: $('#rDetails').value } });
    $('#rAmount').value = $('#rTitle').value = $('#rDetails').value = '';
    toast('Entrée ajoutée au casier.'); await loadRecords();
  } catch (err) { onError(err); }
});
$('#vehicleForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/vehicles', { method: 'POST', body: { plate: $('#nvPlate').value, owner: $('#nvOwner').value, model: $('#nvModel').value } });
    $('#nvPlate').value = $('#nvOwner').value = $('#nvModel').value = '';
    toast('Véhicule enregistré.'); await loadVehicles();
  } catch (err) { onError(err); }
});
$('#reportForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/reports', { method: 'POST', body: { title: $('#repTitle').value, content: $('#repContent').value } });
    $('#repTitle').value = $('#repContent').value = '';
    toast('Rapport enregistré.'); await loadReports();
  } catch (err) { onError(err); }
});
$('#warrantForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/warrants', { method: 'POST', body: { name: $('#wName').value, reason: $('#wReason').value } });
    $('#wName').value = $('#wReason').value = '';
    toast('Avis de recherche émis.'); await loadDashboard();
  } catch (err) { onError(err); }
});

/* ---------- Messages des jeux (iframe) ---------- */
window.addEventListener('message', (ev) => {
  if (ev.source !== frame.contentWindow) return;
  const m = ev.data || {};
  if (m.type === 'mdt-record') tryEnter();
  else if (m.type === 'mdt-close') setView('games');
});

setView('games');
