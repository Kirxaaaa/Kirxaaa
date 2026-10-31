const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const post = (name, data = {}) =>
  fetch(`https://${GetParentResourceName()}/${name}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (t) => (t ? new Date(t).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '');
const empty = (msg) => `<div class="empty">${esc(msg)}</div>`;

const TITLES = { dashboard: 'Tableau de bord', citizens: 'Citoyens', vehicles: 'Véhicules', reports: 'Rapports', warrants: 'Avis de recherche', agents: 'Comptes' };
let state = { warrants: [], reports: [], canDelete: false, admin: false, citizen: null, authed: false, view: null };
let toastTimer;
const frame = $('#games');

/* ---------- Écrans : jeux -> connexion -> MDT ---------- */
function setView(v) {
  state.view = v;
  frame.classList.toggle('hidden', v !== 'games');
  $('#gate').classList.toggle('hidden', v !== 'gate');
  $('#app').classList.toggle('hidden', v !== 'app');
  if (v === 'games') setTimeout(() => frame.contentWindow && frame.contentWindow.focus(), 50);
  if (v === 'gate') { showGate('login'); $('#lUser').focus(); }
}
function hideAll() { state.view = null; frame.classList.add('hidden'); $('#gate').classList.add('hidden'); $('#app').classList.add('hidden'); }

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

$('#loginForm').addEventListener('submit', (e) => {
  e.preventDefault();
  $('#lErr').textContent = '';
  post('login', { username: $('#lUser').value, password: $('#lPass').value });
});
$('#signupForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const err = $('#sErr'); err.textContent = '';
  if ($('#sPass').value !== $('#sPass2').value) { err.textContent = 'Les deux mots de passe ne sont pas identiques.'; return; }
  post('signup', { username: $('#sUser').value, password: $('#sPass').value });
});

function enterMdt(data) {
  state = { ...state, ...data, canDelete: data.officer.canDelete, admin: data.officer.admin, authed: true };
  $('#officerName').textContent = data.officer.name;
  $('#officerGrade').textContent = [data.officer.grade, '@' + data.officer.username].filter(Boolean).join(' · ');
  $('#reportResults').dataset.searched = '';
  renderLists(); show('dashboard');
  setView('app');
}

$('#logoutBtn').addEventListener('click', () => { post('logout'); state.authed = false; state.payload = null; setView('games'); });

/* ---------- Navigation MDT ---------- */
function show(view) {
  $$('.view').forEach((v) => v.classList.toggle('hidden', v.id !== `view-${view}`));
  $$('.rail nav button').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  $('#title').textContent = TITLES[view];
  if (view === 'agents') post('search', { kind: 'agent', query: $('#view-agents input').value });
}
$$('.rail nav button').forEach((b) => b.addEventListener('click', () => show(b.dataset.view)));
$('#closeBtn').addEventListener('click', () => post('close'));
document.addEventListener('keyup', (e) => {
  if (e.key !== 'Escape') return;
  if (state.view === 'gate') setView('games');
  else if (state.view === 'app' || state.view === 'games') post('close');
});

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 3500);
}

/* ---------- Rendu ---------- */
function warrantCard(w) {
  const del = state.canDelete ? `<button class="ghost small" data-del="${w.id}">Lever l'avis</button>` : '';
  return `<div class="card wanted">
    <h3>${esc(w.citizen_name)}</h3><p>${esc(w.reason)}</p>
    <div class="meta"><span>${esc(w.author)} · ${fmtDate(w.created_at)}</span>${del}</div></div>`;
}
function reportCard(r) {
  return `<div class="card"><h3>${esc(r.title)}</h3><p>${esc(r.content)}</p>
    <div class="meta"><span>${esc(r.author)}</span><span>${fmtDate(r.created_at)}</span></div></div>`;
}

function renderLists() {
  const w = state.warrants.length ? state.warrants.map(warrantCard).join('') : empty('Aucun avis de recherche actif.');
  $('#dashWarrants').innerHTML = state.warrants.slice(0, 6).map(warrantCard).join('') || empty('Aucun avis de recherche actif.');
  $('#warrantList').innerHTML = w;
  $('#dashReports').innerHTML = state.reports.slice(0, 6).map(reportCard).join('') || empty('Aucun rapport enregistré.');
  if (!$('#reportResults').dataset.searched) $('#reportResults').innerHTML = state.reports.map(reportCard).join('') || empty('Aucun rapport enregistré.');
}

document.addEventListener('click', (e) => {
  const del = e.target.closest('[data-del]');
  if (del) post('delWarrant', { id: Number(del.dataset.del) });
  const acc = e.target.closest('[data-delacc]');
  if (acc && confirm('Supprimer ce compte MDT ?')) post('delAccount', { id: Number(acc.dataset.delacc) });
});

/* ---------- Recherches ---------- */
$$('.search').forEach((f) =>
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const kind = f.dataset.kind;
    if (kind === 'report') $('#reportResults').dataset.searched = '1';
    post('search', { kind, query: $('input', f).value });
  }));

function renderResult(kind, rows) {
  if (kind === 'citizen') {
    $('#citizenResults').innerHTML = rows.length
      ? rows.map((c) => `<div class="card click" data-cid="${esc(c.id)}" data-name="${esc(c.name)}" data-meta="${esc([c.dob, c.sex].filter(Boolean).join(' · '))}">
          <h3>${esc(c.name)}</h3><p class="muted">${esc(c.dob || 'Date de naissance inconnue')}</p></div>`).join('')
      : empty('Aucun citoyen trouvé.');
  } else if (kind === 'vehicle') {
    $('#vehicleResults').innerHTML = rows.length
      ? rows.map((v) => `<div class="card"><h3>${esc(v.plate)}</h3>
          <p>${esc(v.owner_name || 'Propriétaire inconnu')}</p>
          ${v.model ? `<div class="meta"><span>${esc(v.model)}</span></div>` : ''}</div>`).join('')
      : empty('Aucun véhicule trouvé pour cette plaque.');
  } else if (kind === 'agent') {
    $('#agentResults').innerHTML = rows.length
      ? rows.map((a) => `<div class="card"><h3>${esc(a.name)} <span class="muted">@${esc(a.username)}</span></h3>
          <p class="muted">${esc(a.job)}${a.grade ? ' · ' + esc(a.grade) : ''}</p>
          <div class="meta"><span>Créé le ${fmtDate(a.created_at)} · dernière connexion ${fmtDate(a.last_login) || 'jamais'}</span>
          ${state.admin ? `<button class="ghost small" data-delacc="${a.id}">Supprimer</button>` : ''}</div></div>`).join('')
      : empty('Aucun compte pour le moment.');
  } else if (kind === 'report') {
    $('#reportResults').innerHTML = rows.length ? rows.map(reportCard).join('') : empty('Aucun rapport ne correspond.');
  } else if (kind === 'records') {
    $('#recordList').innerHTML = rows.length
      ? rows.map((r) => `<div class="card"><h3><span class="tag ${esc(r.type)}">${esc(r.type)}</span> ${esc(r.title)}${r.amount ? ` — ${Number(r.amount).toLocaleString('fr-FR')} $` : ''}</h3>
          ${r.details ? `<p>${esc(r.details)}</p>` : ''}
          <div class="meta"><span>${esc(r.author)}</span><span>${fmtDate(r.created_at)}</span></div></div>`).join('')
      : empty('Casier vierge.');
  }
}

$('#citizenResults').addEventListener('click', (e) => {
  const c = e.target.closest('[data-cid]');
  if (!c) return;
  state.citizen = { id: c.dataset.cid, name: c.dataset.name };
  $('#cName').textContent = c.dataset.name;
  $('#cMeta').textContent = c.dataset.meta;
  $('#citizenDetail').classList.remove('hidden');
  $('#recordList').innerHTML = '';
  post('records', { id: c.dataset.cid });
});

/* ---------- Formulaires ---------- */
$('#recordForm').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!state.citizen) return;
  post('addRecord', {
    id: state.citizen.id, name: state.citizen.name,
    type: $('#rType').value, amount: $('#rAmount').value,
    title: $('#rTitle').value, details: $('#rDetails').value,
  });
  $('#rAmount').value = $('#rTitle').value = $('#rDetails').value = '';
});

$('#reportForm').addEventListener('submit', (e) => {
  e.preventDefault();
  post('addReport', { title: $('#repTitle').value, content: $('#repContent').value });
  $('#repTitle').value = $('#repContent').value = '';
});

$('#warrantForm').addEventListener('submit', (e) => {
  e.preventDefault();
  post('addWarrant', { name: $('#wName').value, reason: $('#wReason').value });
  $('#wName').value = $('#wReason').value = '';
});

/* ---------- Messages des jeux (iframe) ---------- */
window.addEventListener('message', (ev) => {
  const m = ev.data || {};
  if (ev.source === frame.contentWindow) {
    if (m.type === 'mdt-record') {
      // Record de Snake : accès direct si déjà connecté, sinon écran de connexion
      if (state.authed && state.payload) enterMdt(state.payload);
      else setView('gate');
    } else if (m.type === 'mdt-close') post('close');
    return;
  }

  /* ---------- Messages du jeu FiveM ---------- */
  switch (m.action) {
    case 'open':
      state.authed = !!m.data.session;
      state.payload = m.data.payload || null;
      setView('games');
      break;
    case 'auth':
      if (m.res.ok) { state.payload = m.res.data; enterMdt(m.res.data); }
      else {
        const err = state.view === 'gate' && !$('#signupForm').classList.contains('hidden') ? $('#sErr') : $('#lErr');
        err.textContent = m.res.error || 'Erreur.';
        $('#lPass').value = '';
      }
      break;
    case 'close': hideAll(); break;
    case 'refresh':
      state.warrants = m.data.warrants; state.reports = m.data.reports;
      renderLists(); break;
    case 'result': renderResult(m.kind, m.rows); break;
    case 'toast': toast(m.message); break;
  }
});
