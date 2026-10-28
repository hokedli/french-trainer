// UI: sign-in, practice set → Check → results table → Next set; status line and Online switch.
import { gradeItem, buildLookup, conjugationWithPronouns, isDontKnow } from './grading.js';
import { computeProgress, chooseWords, buildItems } from './selection.js';
import { SEED } from './seed-progress.js';
import * as sync from './sync.js';

const ACCENTS = ['é', 'è', 'ê', 'ë', 'à', 'â', 'ç', 'î', 'ï', 'ô', 'œ', 'ù', 'û'];
const RESULT_ICON = { correct: '✅', partial: '⚠️', wrong: '❌' };

const main = document.getElementById('main');
const statusLine = document.getElementById('status');
const onlineToggle = document.getElementById('online-toggle');
const accentBar = document.getElementById('accent-bar');
const noticeArea = document.getElementById('notices');
const signOutButton = document.getElementById('sign-out');

// localStorage can throw (private mode, blocked storage); per-device settings then fall back to defaults.
const storage = {
  get(key, fallback) {
    try { const value = localStorage.getItem(key); return value === null ? fallback : JSON.parse(value); } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* setting just isn't remembered */ }
  },
};

const state = {
  onlineMode: storage.get('onlineMode', true),
  deviceId: storage.get('deviceId', null),
  vocab: null,
  lookup: null,
  user: undefined,
  attempts: null,
  pendingCount: 0,
  fromCache: true,
  items: [],
  phase: 'loading', // loading | signin | answering | results
  appUpdateReady: false,
  serviceWorkerRegistration: null,
  lastFocusedField: null,
};
if (!state.deviceId) {
  state.deviceId = crypto.randomUUID();
  storage.set('deviceId', state.deviceId);
}

// ---------- helpers ----------

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const formatNote = (note) => escapeHtml(note).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

function showNotice(text, kind = 'info') {
  const notice = document.createElement('div');
  notice.className = `notice notice-${kind}`;
  notice.innerHTML = `<span>${escapeHtml(text)}</span><button type="button" aria-label="Dismiss">×</button>`;
  notice.querySelector('button').addEventListener('click', () => notice.remove());
  noticeArea.append(notice);
  if (kind === 'info') setTimeout(() => notice.remove(), 8000);
}

function onSyncError(error) {
  console.error(error);
  showNotice(`Sync problem: ${error.message}`, 'error');
}

function updateStatus() {
  const waiting = state.pendingCount;
  const waitingText = `${waiting} answer${waiting === 1 ? '' : 's'} waiting`;
  let text;
  let kind;
  if (!state.user) { text = ''; kind = 'none'; }
  else if (!state.onlineMode) { text = waiting ? `Offline mode — ${waitingText}` : 'Offline mode'; kind = 'offline'; }
  else if (!navigator.onLine) { text = `Offline — ${waitingText}`; kind = 'offline'; }
  else if (waiting) { text = `Syncing — ${waitingText}`; kind = 'syncing'; }
  else if (state.fromCache) { text = 'Connecting…'; kind = 'syncing'; }
  else { text = 'Synced'; kind = 'synced'; }
  statusLine.textContent = text;
  statusLine.dataset.state = kind;
}

// ---------- vocabulary ----------

async function loadVocab() {
  // The service worker answers this from its cache, so it works offline.
  const response = await fetch('vocab.json');
  if (!response.ok) throw new Error(`Could not load vocab.json (${response.status})`);
  return response.json();
}

function useVocab(vocab) {
  state.vocab = vocab;
  state.lookup = buildLookup(vocab.words);
}

async function checkForVocabUpdate() {
  let latest;
  try {
    // "fresh" tells the service worker to go to the network (and refresh its cached copy)
    const response = await fetch(`vocab.json?fresh=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return;
    latest = await response.json();
  } catch {
    return; // no connection: keep the cached copy
  }
  if (latest.version <= state.vocab.version) return;
  const before = new Map(state.vocab.words.map((w) => [w.id, JSON.stringify(w)]));
  const afterIds = new Set(latest.words.map((w) => w.id));
  const added = latest.words.filter((w) => !before.has(w.id)).length;
  const removed = [...before.keys()].filter((id) => !afterIds.has(id)).length;
  const changed = latest.words.filter((w) => before.has(w.id) && before.get(w.id) !== JSON.stringify(w)).length;
  useVocab(latest);
  const parts = [added && `+${added} word${added === 1 ? '' : 's'}`, removed && `−${removed} removed`, changed && `${changed} changed`].filter(Boolean);
  showNotice(`Vocabulary updated: ${parts.join(', ') || `version ${latest.version}`}`);
}

// ---------- service worker (offline + app updates) ----------

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.register('sw.js').then((registration) => { state.serviceWorkerRegistration = registration; }, onSyncError);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return; // first install, nothing to reload
    state.appUpdateReady = true;
    if (state.phase === 'answering' || state.phase === 'results') showNotice('App updated — it will reload when you start the next set.');
    else location.reload();
  });
}

function checkForAppUpdate() {
  state.serviceWorkerRegistration?.update().catch(() => { /* offline */ });
}

// ---------- screens ----------

function renderMessage(title, text) {
  accentBar.hidden = true;
  main.innerHTML = `<section class="card"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(text)}</p></section>`;
}

function renderSignIn() {
  state.phase = 'signin';
  accentBar.hidden = true;
  signOutButton.hidden = true;
  const canSignIn = state.onlineMode;
  main.innerHTML = `
    <section class="card">
      <h2>Bonjour !</h2>
      <p>Sign in once on this device. After that the app also works offline.</p>
      <button type="button" class="primary" id="sign-in" ${canSignIn ? '' : 'disabled'}>Sign in with Google</button>
      ${canSignIn ? '' : '<p class="muted">Switch <b>Online</b> on (top right) to sign in.</p>'}
      <p class="error" id="sign-in-error"></p>
    </section>`;
  document.getElementById('sign-in')?.addEventListener('click', async () => {
    try {
      await sync.signIn();
    } catch (error) {
      document.getElementById('sign-in-error').textContent = `Sign-in failed: ${error.code || error.message}`;
    }
  });
}

function typeHint(entry) {
  switch (entry.type) {
    case 'noun': return "noun · article + word — l'… / les … need (m) or (f)";
    case 'country': return 'country · with its article';
    case 'adjective': return entry.masc && entry.masc !== entry.fem ? 'adjective · masculine / feminine' : 'adjective';
    case 'verb': return 'verb · infinitive + all 6 forms, no pronouns needed';
    case 'number': return 'number · in words';
    default: return 'expression';
  }
}

function promptHtml(item, index) {
  const fieldAttributes = `name="answer-${index}" id="answer-${index}" lang="fr" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false"`;
  const field = item.entry.type === 'verb' && !item.fillIn
    ? `<textarea ${fieldAttributes} rows="3" placeholder="manger, mange, manges, …"></textarea>`
    : `<input type="text" ${fieldAttributes} enterkeyhint="next">`;
  const question = item.fillIn
    ? `<div class="prompt-text">${escapeHtml(item.fillIn.sentence)}${item.fillIn.hint ? ` <span class="paren">(${escapeHtml(item.fillIn.hint)})</span>` : ''}</div>
       <div class="prompt-sub">${escapeHtml(item.fillIn.translation)} · fill in the blank</div>`
    : `<div class="prompt-text">${escapeHtml(item.entry.en)}</div><div class="prompt-sub">${escapeHtml(typeHint(item.entry))}</div>`;
  return `<li class="prompt"><label for="answer-${index}">${question}</label>${field}</li>`;
}

function renderPractice() {
  accentBar.hidden = false;
  main.innerHTML = `
    <form id="practice-form" class="practice" novalidate>
      <ol class="prompts">${state.items.map(promptHtml).join('')}</ol>
      <button type="submit" class="primary">Check</button>
      <p class="muted">Type <b>?</b> or leave a field blank if you don't know. Ctrl+Enter = Check.</p>
    </form>`;
  const form = document.getElementById('practice-form');
  form.addEventListener('submit', (event) => { event.preventDefault(); checkAnswers(form); });
  form.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.target.tagName !== 'INPUT' || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    const fields = [...form.querySelectorAll('input, textarea')];
    const next = fields[fields.indexOf(event.target) + 1];
    (next || form.querySelector('button[type=submit]')).focus();
  });
  window.scrollTo(0, 0);
  form.querySelector('input, textarea').focus();
}

function correctAnswerHtml(item, graded) {
  if (item.entry.type === 'verb' && !item.fillIn) {
    return `<b>${escapeHtml(item.entry.infinitive)}</b><br>${conjugationWithPronouns(item.entry).map(escapeHtml).join('<br>')}`;
  }
  return escapeHtml(graded.correctAnswer);
}

function resultRowHtml({ item, answer, graded }, index) {
  const { entry, fillIn } = item;
  const english = fillIn
    ? `${escapeHtml(fillIn.sentence)}<div class="prompt-sub">${escapeHtml(fillIn.translation)}</div>`
    : escapeHtml(entry.en);
  const youWrote = isDontKnow(answer) ? '<span class="muted">—</span>' : escapeHtml(answer.trim()).replace(/\n/g, '<br>');
  const notes = graded.notes.map((n) => `<p>${formatNote(n)}</p>`);
  if (graded.showExample && entry.example) {
    const translation = entry.example.en ? ` — <i>${escapeHtml(entry.example.en)}</i>` : '';
    notes.push(`<p class="example">${escapeHtml(entry.example.fr)}${translation}</p>`);
  }
  return `
    <tr class="row-${graded.result}">
      <td data-label="#">${RESULT_ICON[graded.result]} ${index + 1}</td>
      <td data-label="English">${english}</td>
      <td data-label="You wrote" lang="fr">${youWrote}</td>
      <td data-label="Correct answer" lang="fr">${correctAnswerHtml(item, graded)}</td>
      <td data-label="Explanation">${notes.join('') || '<span class="muted">Parfait !</span>'}</td>
    </tr>`;
}

function renderResults(results) {
  accentBar.hidden = true;
  const score = results.filter((r) => r.graded.result === 'correct').length;
  main.innerHTML = `
    <section class="results">
      <h2 class="score">Score: ${score}/${results.length}</h2>
      <table class="results-table">
        <thead><tr><th>#</th><th>English</th><th>You wrote</th><th>Correct answer</th><th>Explanation</th></tr></thead>
        <tbody>${results.map(resultRowHtml).join('')}</tbody>
      </table>
      <button type="button" class="primary" id="next-set">Next set <kbd>N</kbd></button>
    </section>`;
  document.getElementById('next-set').addEventListener('click', startNewSet);
  window.scrollTo(0, 0);
}

// ---------- session flow ----------

function startNewSet() {
  if (state.appUpdateReady) { location.reload(); return; }
  const progress = computeProgress(state.vocab.words, state.attempts, SEED);
  const words = chooseWords({ words: state.vocab.words, progress, previousSetIds: storage.get('previousSetIds', []) });
  storage.set('previousSetIds', words.map((w) => w.id));
  state.items = buildItems(words);
  state.phase = 'answering';
  renderPractice();
}

function checkAnswers(form) {
  const results = state.items.map((item, index) => {
    const answer = form.elements[`answer-${index}`].value;
    return { item, answer, graded: gradeItem(item, answer, { lookup: state.lookup }) };
  });
  for (const { item, answer, graded } of results) {
    sync.recordAttempt({ wordId: item.entry.id, result: graded.result, myAnswer: answer.trim(), deviceId: state.deviceId }, onSyncError);
  }
  state.phase = 'results';
  renderResults(results);
}

function onUser(user) {
  state.user = user;
  state.attempts = null;
  updateStatus();
  if (!user) { renderSignIn(); return; }
  signOutButton.hidden = false;
  if (state.phase === 'signin' || state.phase === 'loading') renderMessage('Un moment…', 'Loading your progress.');
}

function onAttempts({ attempts, pendingCount, fromCache }) {
  const firstSnapshot = state.attempts === null;
  state.attempts = attempts;
  state.pendingCount = pendingCount;
  state.fromCache = fromCache;
  updateStatus();
  if (firstSnapshot && state.phase !== 'answering' && state.phase !== 'results') startNewSet();
}

async function onToggleOnline() {
  state.onlineMode = onlineToggle.checked;
  storage.set('onlineMode', state.onlineMode);
  if (sync.isFirebaseConfigured) await sync.setNetworkEnabled(state.onlineMode);
  updateStatus();
  if (state.phase === 'signin') renderSignIn();
  if (state.onlineMode) { checkForVocabUpdate(); checkForAppUpdate(); }
}

// ---------- accent buttons & keyboard ----------

function setupAccentBar() {
  accentBar.innerHTML = ACCENTS.map((letter) => `<button type="button" data-letter="${letter}">${letter}</button>`).join('');
  // pointerdown + preventDefault keeps the focus (and the phone keyboard) in the answer field
  accentBar.addEventListener('pointerdown', (event) => { if (event.target.dataset.letter) event.preventDefault(); });
  accentBar.addEventListener('click', (event) => {
    const letter = event.target.dataset.letter;
    const field = state.lastFocusedField;
    if (!letter || !field || !document.body.contains(field)) return;
    field.setRangeText(letter, field.selectionStart, field.selectionEnd, 'end');
    field.focus();
  });
  document.addEventListener('focusin', (event) => {
    if (event.target.matches('.practice input, .practice textarea')) state.lastFocusedField = event.target;
  });
}

function onKeyDown(event) {
  const typing = event.target.matches('input, textarea');
  const modifier = event.ctrlKey || event.metaKey || event.altKey;
  if (state.phase === 'results' && !typing && !modifier && event.key.toLowerCase() === 'n') {
    event.preventDefault();
    startNewSet();
  } else if (state.phase === 'answering' && event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    document.getElementById('practice-form').requestSubmit();
  }
}

// ---------- start ----------

async function boot() {
  onlineToggle.checked = state.onlineMode;
  onlineToggle.addEventListener('change', onToggleOnline);
  signOutButton.addEventListener('click', () => sync.signOutUser().catch(onSyncError));
  setupAccentBar();
  document.addEventListener('keydown', onKeyDown);
  window.addEventListener('online', updateStatus);
  window.addEventListener('offline', updateStatus);
  registerServiceWorker();

  useVocab(await loadVocab());
  if (!sync.isFirebaseConfigured) {
    renderMessage('Setup needed', 'Firebase is not configured yet: fill in js/firebase-config.js.');
    return;
  }
  await sync.startSync({ onlineMode: state.onlineMode, onUser, onAttempts, onError: onSyncError });
  if (state.onlineMode) checkForVocabUpdate();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.onlineMode) { checkForVocabUpdate(); checkForAppUpdate(); }
  });
}

boot().catch((error) => {
  console.error(error);
  renderMessage('Something went wrong', error.message);
});
