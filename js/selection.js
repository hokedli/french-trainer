// Leitner boxes computed from the attempt log, and choosing the next set of prompts.

export const SET_SIZE = 10;
const BOX_WEIGHT = { 1: 16, 2: 8, 3: 4, 4: 2, 5: 1 };
const DAY_MS = 24 * 60 * 60 * 1000;

// First time a word is seen: correct → box 3, almost → box 2, wrong → box 1.
function nextBox(box, result) {
  if (box === undefined) return result === 'correct' ? 3 : result === 'partial' ? 2 : 1;
  if (result === 'correct') return Math.min(5, box + 1);
  if (result === 'partial') return Math.max(1, box - 1);
  return 1;
}

// Returns Map wordId → { box, lastSeen }. Ids no longer in the vocab are ignored.
export function computeProgress(words, attempts, seed) {
  const knownIds = new Set(words.map((w) => w.id));
  const progress = new Map();
  for (const [id, box] of Object.entries(seed.boxes)) {
    if (knownIds.has(id)) progress.set(id, { box, lastSeen: seed.timestamp });
  }
  const ordered = attempts.filter((a) => knownIds.has(a.wordId)).sort((a, b) => a.timestamp - b.timestamp);
  for (const attempt of ordered) {
    const previous = progress.get(attempt.wordId);
    progress.set(attempt.wordId, { box: nextBox(previous?.box, attempt.result), lastSeen: attempt.timestamp });
  }
  return progress;
}

function reviewWeight(entryProgress, now) {
  const days = Math.max(0, (now - entryProgress.lastSeen) / DAY_MS);
  return BOX_WEIGHT[entryProgress.box] * (1 + Math.min(days, 30) / 3);
}

function weightedSample(items, count, weightOf, random) {
  const pool = items.map((item) => ({ item, weight: weightOf(item) }));
  const chosen = [];
  while (chosen.length < count && pool.length) {
    const total = pool.reduce((sum, p) => sum + p.weight, 0);
    let target = random() * total;
    const index = pool.findIndex((p) => (target -= p.weight) <= 0);
    chosen.push(pool.splice(index === -1 ? pool.length - 1 : index, 1)[0].item);
  }
  return chosen;
}

function shuffle(items, random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// About 40–60 % review once there is history; review favours low boxes and words not seen for a while.
export function chooseWords({ words, progress, previousSetIds = [], now = Date.now(), random = Math.random }) {
  const previous = new Set(previousSetIds);
  const fresh = words.filter((w) => !previous.has(w.id));
  const seen = fresh.filter((w) => progress.has(w.id));
  const unseen = fresh.filter((w) => !progress.has(w.id));
  const weightOf = (w) => reviewWeight(progress.get(w.id), now);

  const reviewTarget = seen.length ? Math.round(SET_SIZE * (0.4 + random() * 0.2)) : 0;
  const review = weightedSample(seen, Math.min(reviewTarget, seen.length), weightOf, random);
  const newWords = weightedSample(unseen, SET_SIZE - review.length, () => 1, random);
  let chosen = [...review, ...newWords];

  if (chosen.length < SET_SIZE) {
    const chosenIds = new Set(chosen.map((w) => w.id));
    const remainingSeen = seen.filter((w) => !chosenIds.has(w.id));
    chosen.push(...weightedSample(remainingSeen, SET_SIZE - chosen.length, weightOf, random));
  }
  if (chosen.length < SET_SIZE) {
    const fromPrevious = words.filter((w) => previous.has(w.id));
    chosen.push(...shuffle(fromPrevious, random).slice(0, SET_SIZE - chosen.length));
  }
  return shuffle(chosen, random);
}

// ---------- sentence fill-ins ----------

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const BLANK = '______';

function fillInForms(entry) {
  switch (entry.type) {
    case 'verb':
      return entry.conj.map((form, index) => ({ form: form.replace(/^j'/, ''), formIndex: index }))
        .concat([{ form: entry.infinitive, formIndex: 'infinitive' }]);
    case 'adjective':
      return [entry.fem && `${entry.fem}s`, entry.masc && `${entry.masc}s`, entry.fem, entry.masc]
        .filter(Boolean).map((form) => ({ form }));
    case 'noun':
    case 'country':
      return [`${entry.fr}s`, `${entry.fr}x`, entry.fr].map((form) => ({ form }));
    case 'expression':
      return [{ form: entry.fr.replace(/…/g, '').replace(/[\s.!?]+$/, '') }];
    default:
      return [];
  }
}

// Blanks the vocab word (or the conjugated form) out of the example sentence; null if not possible.
export function buildFillIn(entry) {
  if (!entry.example?.fr || !entry.example?.en) return null;
  const sentence = entry.example.fr;
  const forms = fillInForms(entry).sort((a, b) => b.form.length - a.form.length);
  for (const { form, formIndex } of forms) {
    if (form.length < 2) continue;
    const match = new RegExp(`(^|[^\\p{L}])(${escapeRegExp(form)})(?![\\p{L}])`, 'iu').exec(sentence);
    if (!match) continue;
    const start = match.index + match[1].length;
    const blanked = sentence.slice(0, start) + BLANK + sentence.slice(start + match[2].length);
    if (blanked.replace(BLANK, '').replace(/[^\p{L}]/gu, '').length < 4) continue;
    const hint = entry.type === 'verb' ? entry.infinitive : entry.type === 'adjective' ? entry.masc || entry.fem : null;
    return { sentence: blanked, answer: match[2], hint, translation: entry.example.en, formIndex };
  }
  return null;
}

// Mostly vocab: 1–2 of the set become sentence fill-ins when possible.
export function buildItems(chosenWords, random = Math.random) {
  const fillInCount = random() < 0.5 ? 1 : 2;
  const fillInIds = new Set(shuffle(chosenWords.filter((w) => buildFillIn(w)), random).slice(0, fillInCount).map((w) => w.id));
  return chosenWords.map((entry) => (fillInIds.has(entry.id) ? { entry, fillIn: buildFillIn(entry) } : { entry }));
}
