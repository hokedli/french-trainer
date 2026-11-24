// Rule-based grading for every answer type. Pure functions: no DOM, no network.
// Notes may contain **bold** markers; the UI turns them into <b>.

export const PRONOUNS = ['je', 'tu', 'il/elle/on', 'nous', 'vous', 'ils/elles'];
const SUBJECTS = ['je', 'tu', 'il', 'nous', 'vous', 'ils'];
const RESULT_RANK = { wrong: 0, partial: 1, correct: 2 };
const KIND_RANK = { different: 0, close: 1, accent: 2, exact: 3 };
const OE_NOTE = 'You typed "oe" — French writes it as one letter, **œ** (sœur). Accepted!';

// ---------- text helpers ----------

export function normalizeText(text) {
  return String(text ?? '')
    .normalize('NFC')
    .replace(/[’‘`´ʼ]/g, "'")
    .replace(/\s*'\s*/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const stripAccents = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC');
const expandLigatures = (s) => s.replace(/œ/g, 'oe').replace(/æ/g, 'ae');
const withoutPunctuation = (s) => s.replace(/\.\.\.|…/g, ' ').replace(/[.!?,;:«»"()]/g, ' ').replace(/\s+/g, ' ').trim();
const withoutTrailingPunctuation = (s) => s.replace(/[\s.!?,;:]+$/, '');
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const unique = (list) => [...new Set(list)];

export function isDontKnow(raw) {
  return /^\?*$/.test(normalizeText(raw));
}

function levenshtein(a, b) {
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = previous[j];
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return previous[b.length];
}

const closeThreshold = (length) => (length <= 5 ? 1 : length <= 12 ? 2 : Math.floor(length / 6));

function describeAccents(user, correct, correctDisplay) {
  const fixes = [];
  for (let i = 0; i < correct.length; i++) {
    if (user[i] === correct[i]) continue;
    if (stripAccents(correct[i]) === correct[i]) fixes.push(`no accent on ${correct[i]} (you wrote ${user[i]})`);
    else fixes.push(`${correct[i]}, not ${user[i]}`);
  }
  return `Accent: **${correctDisplay}** — ${unique(fixes).join('; ')}.`;
}

// Compares two normalized strings. kind: exact | accent | close | different
export function compareText(user, correct, correctDisplay = correct) {
  if (user === correct) return { kind: 'exact' };
  const userExpanded = expandLigatures(user);
  const correctExpanded = expandLigatures(correct);
  const usedOe = correct.includes('œ') && !user.includes('œ') && user.includes('oe');
  if (userExpanded === correctExpanded) return { kind: 'exact', usedOe };
  if (stripAccents(userExpanded) === stripAccents(correctExpanded)) {
    return { kind: 'accent', usedOe, note: describeAccents(userExpanded, correctExpanded, correctDisplay) };
  }
  const distance = levenshtein(stripAccents(userExpanded), stripAccents(correctExpanded));
  if (distance <= closeThreshold(correctExpanded.length)) {
    return { kind: 'close', usedOe, note: `Almost — the spelling is **${correctDisplay}**.` };
  }
  return { kind: 'different' };
}

// Short words that only the accent tells apart: here a missing or extra accent is another word, not a spelling slip
const WORDS_TOLD_APART_BY_ACCENT = {
  a: 'has (il a, from avoir)', 'à': 'in, at, to',
  ou: 'or', 'où': 'where',
  la: 'the (feminine)', 'là': 'here, there',
};
function gradeAsAccentPairWord(user, correct) {
  const isPairWord = (word) => Object.hasOwn(WORDS_TOLD_APART_BY_ACCENT, word);
  if (user === correct || !isPairWord(user) || !isPairWord(correct) || stripAccents(user) !== stripAccents(correct)) return null;
  return { result: 'wrong', notes: [`**${user}** = ${WORDS_TOLD_APART_BY_ACCENT[user]}. The accent makes it a different word: here you need **${correct}**.`] };
}

const bestComparison = (comparisons) => comparisons.reduce((best, c) => (KIND_RANK[c.kind] > KIND_RANK[best.kind] ? c : best));
const kindToResult = (kind) => (kind === 'exact' ? 'correct' : kind === 'different' ? 'wrong' : 'partial');
const worstResult = (...results) => results.reduce((a, b) => (RESULT_RANK[a] <= RESULT_RANK[b] ? a : b));
const comparisonNotes = (cmp) => [cmp.note, cmp.usedOe && OE_NOTE].filter(Boolean);

// ---------- display ----------

function nounDisplay(article, fr, gender) {
  const genderLabel = gender === 'mf' ? 'm/f' : gender;
  if (article === "l'") return `l'${fr} (${genderLabel})`;
  if (article === 'les') return `les ${fr} (${genderLabel})`;
  if (!article) return fr;
  return `${article} ${fr}`;
}

function withPronoun(form, index) {
  if (index === 0 && form.startsWith("j'")) return form;
  return `${SUBJECTS[index]} ${form}`;
}

export const conjugationWithPronouns = (entry) => entry.conj.map(withPronoun);

// The main form for one person (0 = je … 5 = ils), plus that person's form in the alternative conjugation conjAlt
// when it is spelt differently (payer: paie / paye; nous payons is the same in both).
export const acceptedVerbForms = (entry, personIndex) => unique([entry.conj[personIndex], entry.conjAlt?.[personIndex]].filter(Boolean));

export function shortName(entry) {
  if (entry.type === 'noun' || entry.type === 'country') return nounDisplay(entry.article, entry.fr, entry.gender);
  if (entry.type === 'verb') return entry.infinitive;
  if (entry.type === 'adjective') return entry.masc || entry.fem;
  return entry.fr;
}

export function formatAnswer(entry) {
  const alt = entry.alt || [];
  switch (entry.type) {
    case 'noun':
    case 'country':
      return [nounDisplay(entry.article, entry.fr, entry.gender), ...alt].join(' / ');
    case 'adjective': {
      const main = !entry.masc ? `${entry.fem} (feminine only)` : entry.masc === entry.fem ? entry.masc : `${entry.masc} / ${entry.fem}`;
      return alt.length ? `${main} (also: ${alt.join(', ')})` : main;
    }
    case 'verb':
      return `${entry.infinitive}: ${entry.conj.map((_, i) => withPronoun(acceptedVerbForms(entry, i).join(' / '), i)).join(', ')}`;
    default:
      return [entry.fr, ...alt].join(' / ');
  }
}

// ---------- lookup of other vocab words ----------

export const lookupKey = (s) => stripAccents(expandLigatures(withoutPunctuation(normalizeText(s))));

// The entry's own word(s), without alts: "sac", "grand" + "grande", "manger"
export const ownForms = (entry) => [entry.fr, entry.masc, entry.fem, entry.infinitive].filter(Boolean);

// The words in the entry's alts, as the lookup indexes them
export function altForms(entry) {
  const alts = entry.alt || [];
  switch (entry.type) {
    case 'noun':
    case 'country':
      return alts.map((a) => parseNounAnswer(normalizeText(a)).word);
    case 'adjective':
      // Drop bracketed notes first, or "tchèque (m/f)" would split into "tchèque (m" and "f)"
      return alts.flatMap((a) => a.replace(/\s*\(.*?\)/g, '').split('/'));
    case 'verb':
      return [];
    default:
      return alts;
  }
}

const formsForLookup = (entry) => [...ownForms(entry), ...altForms(entry)];

// Its forms in a sentence: the conjugated forms of a verb, the real plurals of a noun or adjective. Only fill-ins look
// these up, to tell that "étudie" or "nombres" is another word; cards find verbs by their infinitive.
function sentenceFormsForLookup(entry) {
  const forms = formsForLookup(entry);
  switch (entry.type) {
    case 'verb': {
      // Imperatives too (sois, va), but not the bare verb of a reflexive one (appelle-toi), which is another verb's form
      const imperatives = imperativeForms(entry).filter((f) => f.slot.pronounBefore !== false).map((f) => f.form);
      return [...entry.conj, ...(entry.conjAlt || [])].flatMap((form) => [form, form.replace(/^j'/, '')]).concat(imperatives);
    }
    case 'noun':
    case 'adjective':
      return [...forms, ...forms.map(frenchPlural)];
    default:
      return forms;
  }
}

function indexByForm(words, formsOf) {
  const byForm = new Map();
  for (const entry of words) {
    for (const form of formsOf(entry)) {
      if (!form) continue;
      const key = lookupKey(form);
      if (!byForm.has(key)) byForm.set(key, []);
      if (!byForm.get(key).includes(entry)) byForm.get(key).push(entry);
    }
  }
  return byForm;
}

// kindOf links: entry → its more general "base word". Invalid links are logged and ignored.
function buildKindOfLinks(words) {
  const byId = new Map(words.map((w) => [w.id, w]));
  const baseIdByKindId = new Map();
  const kindsByBaseId = new Map();
  for (const entry of words) {
    if (entry.kindOf === undefined) continue;
    const base = byId.get(entry.kindOf);
    let problem = null;
    if (!base) problem = 'is not an id in vocab.json';
    else if (base.id === entry.id) problem = 'points to the entry itself';
    else if (base.kindOf !== undefined) problem = `has its own kindOf ("${base.kindOf}")`;
    if (problem) {
      console.warn(`vocab: ${entry.id} has kindOf "${entry.kindOf}", which ${problem} — link ignored`);
      continue;
    }
    baseIdByKindId.set(entry.id, base.id);
    if (!kindsByBaseId.has(base.id)) kindsByBaseId.set(base.id, []);
    kindsByBaseId.get(base.id).push(entry);
  }
  return { byId, baseIdByKindId, kindsByBaseId };
}

// Why entry's acceptedSynonyms link to otherId is invalid, or null. An entry never accepts its own confusables, and an id
// is only ever one of kindOf / acceptedSynonyms / confusables / alt for an entry. The other entry may list this one as a
// confusable: a one-way acceptance (n-chemisier accepts chemise; on n-chemise, chemisier stays a trap).
export function synonymLinkProblem(entry, otherId, byId) {
  const other = byId.get(otherId);
  if (!other) return 'is not an id in vocab.json';
  if (other.id === entry.id) return 'points to the entry itself';
  if (other.type !== entry.type) return `is a ${other.type}, not a ${entry.type}`;
  if ((entry.confusables || []).includes(other.id)) return 'is also a confusable';
  if (entry.kindOf === other.id || other.kindOf === entry.id || (entry.kindOf && entry.kindOf === other.kindOf)) {
    return 'is linked by kindOf (base word or another kind of it)';
  }
  return null;
}

// acceptedSynonyms links, one direction: entry → ids whose answers are also right on its card. Invalid links are logged and ignored.
function buildSynonymLinks(words, byId) {
  const synonymIdsById = new Map();
  for (const entry of words) {
    const validIds = new Set();
    for (const otherId of entry.acceptedSynonyms || []) {
      const problem = synonymLinkProblem(entry, otherId, byId);
      if (problem) console.warn(`vocab: ${entry.id} has acceptedSynonyms "${otherId}", which ${problem} — link ignored`);
      else validIds.add(otherId);
    }
    if (validIds.size) synonymIdsById.set(entry.id, validIds);
  }
  return synonymIdsById;
}

// Reverse index from every accepted answer to the entries it belongs to, plus the kindOf and acceptedSynonyms links.
export function buildLookup(words) {
  const byForm = indexByForm(words, formsForLookup);
  const bySentenceForm = indexByForm(words, sentenceFormsForLookup);
  const { byId, baseIdByKindId, kindsByBaseId } = buildKindOfLinks(words);
  const synonymIdsById = buildSynonymLinks(words, byId);
  const findIn = (index) => (form, excludeId, type) => (index.get(lookupKey(form)) || [])
    .filter((e) => e.id !== excludeId && (!type || e.type === type));
  const findAll = findIn(byForm);
  return {
    findAll,
    findAllInSentenceForms: findIn(bySentenceForm),
    find: (form, excludeId, type) => findAll(form, excludeId, type)[0],
    baseOf: (entry) => byId.get(baseIdByKindId.get(entry.id)) || null,
    kindsOf: (entry) => kindsByBaseId.get(entry.id) || [],
    synonymIdsOf: (entry) => synonymIdsById.get(entry.id) || new Set(),
    synonymsOf: (entry) => [...(synonymIdsById.get(entry.id) || [])].map((id) => byId.get(id)),
  };
}

// The word without its article: "sac" for le sac, the masculine for adjectives.
const bareName = (entry) => entry.fr || entry.infinitive || entry.masc || entry.fem;

// "le sac à dos (backpack, rucksack) · le sac à main (handbag)" for a base word answered correctly
function kindsNote(entry, lookup) {
  const kinds = lookup?.kindsOf(entry) || [];
  if (!kinds.length) return null;
  return `Also: ${kinds.map((kind) => `**${shortName(kind)}** (${kind.en})`).join(' · ')}`;
}

// What the learner's wrong answer means, when it is another vocab entry
function otherWordNote(entry, other, lookup) {
  const base = lookup.baseOf(entry);
  if (base && other.id === base.id) {
    return `Almost: **${shortName(other)}** (${other.en}) is the general word; this one is more specific.`;
  }
  if (base && lookup.baseOf(other)?.id === base.id) {
    return `That's another kind of **${bareName(base)}**: **${shortName(other)}** = ${other.en}.`;
  }
  return `**${shortName(other)}** = ${other.en}.`;
}

const synonymNote = (entry, other) => `Also right: **${shortName(other)}** = ${other.en}. The word we were after: **${shortName(entry)}**.`;

// The answer is another entry. If this entry's acceptedSynonyms links to it, it is graded with that entry's own rules
// (a full answer counts as correct, with "Also right: …"); otherwise it is wrong and the note says what it means.
// Fill-ins grade synonyms themselves (they must fit the sentence), so they pass acceptSynonyms = false.
// Accents kept: "mèr" is a misspelling of mère, not the word mer
const sameAccentsKey = (s) => expandLigatures(withoutPunctuation(normalizeText(s)));

// The other entries a typed answer is. A noun typed with its article ("les frais" on the frais (fresh) card) is looked up
// without it. In a fill-in (inSentence), other words also count in their sentence forms: étudie, nombres.
// sameAccents: only entries the answer spells exactly, accents included (the lookup itself ignores accents).
function findOtherEntries(entry, form, ctx, { type, inSentence, sameAccents }) {
  const { lookup } = ctx;
  const nounWithoutArticle = type ? null : parseNounAnswer(normalizeText(form)).word;
  const hasArticle = Boolean(nounWithoutArticle) && nounWithoutArticle !== normalizeText(form);
  const nounsOnly = (others) => others.filter((o) => o.type === 'noun' || o.type === 'country');
  const searches = [
    () => lookup.findAll(form, entry.id, type),
    () => (hasArticle ? nounsOnly(lookup.findAll(nounWithoutArticle, entry.id)) : []),
    () => (inSentence ? lookup.findAllInSentenceForms(form, entry.id, type) : []),
    () => (inSentence && hasArticle ? nounsOnly(lookup.findAllInSentenceForms(nounWithoutArticle, entry.id)) : []),
  ];
  const typedKeys = [form, hasArticle && nounWithoutArticle].filter(Boolean).map(sameAccentsKey);
  const spelledExactly = (other) => [...formsForLookup(other), ...(inSentence ? sentenceFormsForLookup(other) : [])]
    .some((f) => f && typedKeys.includes(sameAccentsKey(f)));
  for (const search of searches) {
    const others = sameAccents ? search().filter(spelledExactly) : search();
    if (others.length) return others;
  }
  return [];
}

// options: type (only entries of this type), acceptSynonyms (an acceptedSynonyms entry is graded as right),
// inSentence and sameAccents (see findOtherEntries)
function gradeAsOtherWord(entry, raw, form, ctx, { type, acceptSynonyms = true, inSentence = false, sameAccents = false } = {}) {
  if (!ctx.lookup || ctx.isNestedLookup) return null;
  const others = findOtherEntries(entry, form, ctx, { type, inSentence, sameAccents });
  if (!others.length) return null;
  const synonymIds = acceptSynonyms ? ctx.lookup.synonymIdsOf(entry) : new Set();
  for (const other of others.filter((o) => synonymIds.has(o.id))) {
    const otherGrade = gradeEntry(other, raw, { ...ctx, isNestedLookup: true });
    if (otherGrade && otherGrade.result !== 'wrong') {
      return { result: otherGrade.result, notes: [synonymNote(entry, other), ...otherGrade.notes] };
    }
  }
  return { result: 'wrong', notes: others.map((other) => otherWordNote(entry, other, ctx.lookup)) };
}

// ---------- nouns & countries ----------

const ARTICLE_GENDER = { le: 'm', la: 'f', un: 'm', une: 'f', 'le/la': 'mf' };
const GENDER_WORDS = {
  m: 'm', masc: 'm', masculin: 'm', masculine: 'm',
  f: 'f', fem: 'f', 'fém': 'f', feminin: 'f', 'féminin': 'f', feminine: 'f', 'féminine': 'f',
  'm/f': 'mf', 'f/m': 'mf', mf: 'mf', fm: 'mf',
};
const GENDER_PATTERNS = [
  [/age$/, 'm', '-age'], [/ier$/, 'm', '-ier'], [/ment$/, 'm', '-ment'], [/eau$/, 'm', '-eau'], [/isme$/, 'm', '-isme'],
  [/(tion|sion)$/, 'f', '-tion / -sion'], [/té$/, 'f', '-té'], [/ette$/, 'f', '-ette'], [/(ence|ance)$/, 'f', '-ence / -ance'],
  [/ure$/, 'f', '-ure'], [/ie$/, 'f', '-ie'],
];
const genderName = (g) => (g === 'm' ? 'masculine' : 'feminine');

function parseNounAnswer(text) {
  let rest = withoutTrailingPunctuation(text);
  let gender = null;
  const genderMatch = rest.match(/(?:^|\s|\()\(?\s*(m\/f|f\/m|masculine|masculin|masc|m|mf|féminine|feminine|féminin|feminin|fém|fem|f|fm)\s*\.?\s*\)?$/);
  const beforeGender = genderMatch ? rest.slice(0, genderMatch.index).trim() : '';
  // Only a marker when a noun comes before it: "le masculin" is the noun masculin, not le + (m)
  const isGenderMarker = Boolean(genderMatch) && !/^(le|la|les|un|une|des|l'|le\s*\/\s*la)?$/.test(beforeGender);
  if (isGenderMarker) {
    gender = GENDER_WORDS[genderMatch[1]];
    rest = beforeGender;
  }
  let article = null;
  let m;
  if ((m = rest.match(/^le\s*\/\s*la\s+(.*)$/))) { article = 'le/la'; rest = m[1]; }
  else if ((m = rest.match(/^(le|la|les|un|une|des)\s+(.*)$/))) { article = m[1]; rest = m[2]; }
  else if ((m = rest.match(/^l'(.*)$/))) { article = "l'"; rest = m[1]; }
  return { article, word: rest.trim(), gender };
}

// The plural French uses for one word (noun or adjective). Several words or a hyphen: null, the rule doesn't know
// which word takes the plural (pommes de terre, grands-pères), so only a "les …" alt tells.
const PLURAL_S_AFTER_AU_EU = new Set(['landau', 'sarrau', 'bleu', 'pneu', 'émeu']);
const PLURAL_X_AFTER_OU = new Set(['bijou', 'caillou', 'chou', 'genou', 'hibou', 'joujou', 'pou']);
const PLURAL_S_AFTER_AL = new Set(['bal', 'carnaval', 'chacal', 'festival', 'récital', 'régal', 'banal', 'fatal', 'final', 'natal', 'naval']);
const PLURAL_AUX_AFTER_AIL = new Set(['travail', 'corail', 'émail', 'vitrail', 'bail', 'soupirail', 'vantail']);
export function frenchPlural(word) {
  const w = normalizeText(word);
  if (!/^\p{L}+$/u.test(w)) return null;
  if (/[sxz]$/.test(w)) return w;
  if (/(au|eu)$/.test(w)) return w + (PLURAL_S_AFTER_AU_EU.has(w) ? 's' : 'x');
  if (/ou$/.test(w)) return w + (PLURAL_X_AFTER_OU.has(w) ? 'x' : 's');
  if (/al$/.test(w) && !PLURAL_S_AFTER_AL.has(w)) return `${w.slice(0, -2)}aux`;
  if (PLURAL_AUX_AFTER_AIL.has(w)) return `${w.slice(0, -3)}aux`;
  return `${w}s`;
}

function nounCandidates(entry) {
  const main = {
    article: entry.article, word: normalizeText(entry.fr), wordDisplay: entry.fr, gender: entry.gender,
    requireGender: entry.article === "l'" || (entry.article === 'les' && Boolean(entry.pluralOnly)),
    display: nounDisplay(entry.article, entry.fr, entry.gender),
  };
  const parsedAlts = (entry.alt || []).map((altText) => ({ altText, parsed: parseNounAnswer(normalizeText(altText)) }));
  // On a singular noun card, a "les …" alt is the plural: it tells the card what the plural is ("Give the singular"),
  // but isn't an accepted answer there. Fill-ins still use it (nounFillInForms). Countries keep theirs (les Pays-Bas).
  const isPluralAlt = ({ parsed }) => entry.type === 'noun' && entry.article !== 'les' && parsed.article === 'les';
  const pluralAltWords = parsedAlts.filter(isPluralAlt).map(({ parsed }) => parsed.word);
  const alternatives = parsedAlts.filter((a) => !isPluralAlt(a)).map(({ altText, parsed }) => {
    const article = parsed.article === 'le/la' ? 'le' : parsed.article ?? '';
    return {
      article, word: parsed.word, wordDisplay: parsed.word,
      gender: parsed.gender || ARTICLE_GENDER[parsed.article] || entry.gender,
      requireGender: article === "l'", display: altText,
    };
  });
  const candidates = [main, ...alternatives];
  for (const candidate of candidates) {
    candidate.plurals = unique([frenchPlural(candidate.word), ...(candidate === main ? pluralAltWords : [])].filter(Boolean));
  }
  // Every form with this word, e.g. "le dentiste / la dentiste" for an mf noun with its feminine in alt
  for (const candidate of candidates) {
    candidate.sameWordDisplay = unique(candidates.filter((other) => other.word === candidate.word).map((other) => other.display)).join(' / ');
  }
  return candidates;
}

function genderNote(candidate) {
  let note = `**${candidate.wordDisplay}** is ${genderName(candidate.gender)}: **${candidate.display}**.`;
  const pattern = GENDER_PATTERNS.find(([regex]) => regex.test(candidate.word));
  if (pattern && candidate.gender !== 'mf') {
    const [, patternGender, ending] = pattern;
    note += patternGender === candidate.gender
      ? ` Words ending in ${ending} are usually ${genderName(patternGender)}.`
      : ` Careful: most ${ending} words are ${genderName(patternGender)}, but this one is an exception.`;
  }
  return note;
}

function gradeNounAgainst(answer, candidate) {
  const notes = [];
  const cmp = compareText(answer.word, candidate.word, candidate.wordDisplay);
  let pluralIssue = false;
  // "les escargots" on the l'escargot card is the plural of this word, even when the plural is also its own entry.
  // The plural is the real one (frenchPlural, or a "les …" alt): chevaux, gâteaux.
  const answerIsPluralOfWord = candidate.article !== 'les' && cmp.kind !== 'exact' && candidate.plurals.includes(answer.word);
  // "gâteaus", "chevals": the word + s / x, but not its plural
  const answerIsMisspeltPlural = candidate.article !== 'les' && !answerIsPluralOfWord && candidate.plurals.length > 0
    && [candidate.word + 's', candidate.word + 'x'].includes(answer.word);
  let wordResult;
  if (cmp.kind === 'exact') wordResult = 'correct';
  else if (candidate.article === 'les' && [answer.word + 's', answer.word + 'x'].includes(candidate.word)) {
    pluralIssue = true;
    wordResult = 'partial';
  } else if (answerIsPluralOfWord) {
    wordResult = 'partial';
    notes.push(`Give the singular: **${candidate.display}**.`);
  } else if (answerIsMisspeltPlural) {
    wordResult = 'partial';
    notes.push(`Give the singular: **${candidate.display}**.`, `The plural is **${candidate.plurals[0]}**, not ${answer.word}.`);
  } else if (cmp.kind === 'different') return { result: 'wrong', notes, different: true };
  else wordResult = 'partial';
  if (!pluralIssue && !answerIsPluralOfWord && !answerIsMisspeltPlural) notes.push(...comparisonNotes(cmp));
  const wordExact = cmp.kind === 'exact';

  // "le conductrice (f)": the article and the gender marker contradict each other
  const articleGender = ARTICLE_GENDER[answer.article] || null;
  if (answer.gender && articleGender && answer.gender !== 'mf' && articleGender !== 'mf' && answer.gender !== articleGender) {
    notes.push(`**${answer.article}** is ${genderName(articleGender)}, but you marked it (${answer.gender}): **${candidate.sameWordDisplay}**.`);
    return { result: 'wrong', notes, wordExact };
  }

  const givenGender = answer.gender || articleGender;
  const genderRight = Boolean(givenGender) && (candidate.gender === 'mf' || givenGender === candidate.gender);
  const expected = candidate.article;
  const given = answer.article;
  const singularArticles = ['le', 'la', 'un', 'une', 'le/la'];
  const needArticle = () => { notes.push(`Always learn the article: **${candidate.display}**.`); return 'partial'; };
  let articleResult = 'correct';

  if (expected === "l'") {
    if (given === "l'") {
      if (!answer.gender) { articleResult = 'partial'; notes.push(`With l' you can't hear the gender, so always add it: **${candidate.display}**.`); }
      else if (!genderRight) { articleResult = 'wrong'; notes.push(genderNote(candidate)); }
    } else if (given === 'un' || given === 'une') {
      if (!genderRight) { articleResult = 'wrong'; notes.push(genderNote(candidate)); }
      else notes.push(`Tip: learn it as **${candidate.display}**.`);
    } else if (given === 'le' || given === 'la' || given === 'le/la') {
      notes.push(`**le** / **la** become **l'** before a vowel or silent h: **${candidate.display}**.`);
      articleResult = genderRight ? 'partial' : 'wrong';
      if (!genderRight) notes.push(genderNote(candidate));
    } else if (given === 'les' || given === 'des') { articleResult = 'partial'; notes.push(`Give the singular: **${candidate.display}**.`); }
    else articleResult = needArticle();
  } else if (expected === 'le' || expected === 'la') {
    if (given === "l'") {
      articleResult = 'partial';
      notes.push(/^h/.test(candidate.word)
        ? `This h is "aspirated", so there's no l': **${candidate.display}**.`
        : `l' is only used before a vowel or silent h: **${candidate.display}**.`);
      if (answer.gender && !genderRight) { articleResult = 'wrong'; notes.push(genderNote(candidate)); }
    } else if (singularArticles.includes(given)) {
      if (!genderRight) { articleResult = 'wrong'; notes.push(genderNote(candidate)); }
      else if (given === 'un' || given === 'une') notes.push(`Tip: learn it with le / la: **${candidate.display}**.`);
    } else if (given === 'les' || given === 'des') { articleResult = 'partial'; notes.push(`Give the singular: **${candidate.display}**.`); }
    else articleResult = needArticle();
  } else if (expected === 'les') {
    if (given === 'les' || given === 'des') {
      if (candidate.requireGender && !answer.gender) { articleResult = 'partial'; notes.push(`With les you can't hear the gender, so add it: **${candidate.display}**.`); }
      else if (answer.gender && !genderRight) { articleResult = 'wrong'; notes.push(genderNote(candidate)); }
    } else if (given) {
      pluralIssue = true;
      articleResult = givenGender && !genderRight ? 'wrong' : 'partial';
      if (givenGender && !genderRight) notes.push(genderNote(candidate));
    } else articleResult = needArticle();
  } else if (given) {
    articleResult = 'partial';
    notes.push(`No article here: **${candidate.display}**.`);
  }

  if (pluralIssue) notes.unshift(`**${candidate.display}** is always plural in French.`);
  if (wordResult !== 'correct' && genderRight && expected) notes.push('Gender right ✓');
  return { result: worstResult(wordResult, articleResult), notes, close: cmp.kind === 'close' && !pluralIssue && !answerIsPluralOfWord && !answerIsMisspeltPlural, wordExact, pluralOfWord: answerIsPluralOfWord };
}

function bestGrade(grades) {
  return grades.reduce((best, g) => (RESULT_RANK[g.result] > RESULT_RANK[best.result] || (best.different && !g.different) ? g : best));
}

// Grade against the form the learner actually wrote: for ami / amie, "l'amie (m)" is a gender
// mistake on amie, not a misspelling of ami; "les voisines" is the plural of voisine, not a misspelling of voisin.
function bestNounGrade(grades) {
  const exactWordGrades = grades.filter((g) => g.wordExact || g.pluralOfWord);
  return bestGrade(exactWordGrades.length ? exactWordGrades : grades);
}

function gradeNoun(entry, raw, ctx) {
  const text = normalizeText(raw);
  const parts = /^le\s*\/\s*la\s/.test(text) ? [text] : text.split(/\s*\/\s*(?=le\s|la\s|les\s|l')/).filter(Boolean);
  const candidates = nounCandidates(entry);
  const grades = parts.map((part) => bestNounGrade(candidates.map((c) => gradeNounAgainst(parseNounAnswer(part), c))));
  if (grades.length === 1 && (grades[0].different || grades[0].close)) {
    // A near-spelling that is really another vocab word (la mère for la mer) counts as the wrong word
    const asOtherWord = gradeAsOtherWord(entry, raw, parseNounAnswer(parts[0]).word, ctx);
    if (asOtherWord || grades[0].different) return asOtherWord || { result: 'wrong', notes: [] };
  }
  // The plural is also a confusable entry (les travaux on the travail card): say what that one means. Not for a plural
  // entry that is the same thing (les escargots, the food, on the escargot card)
  const isConfusable = (other) => (entry.confusables || []).includes(other.id) || (other.confusables || []).includes(entry.id);
  const pluralEntryNotes = grades.length === 1 && grades[0].pluralOfWord && ctx.lookup
    ? ctx.lookup.findAll(parseNounAnswer(parts[0]).word, entry.id, 'noun').filter(isConfusable).map((other) => otherWordNote(entry, other, ctx.lookup))
    : [];
  return { result: worstResult(...grades.map((g) => g.result)), notes: unique([...grades.flatMap((g) => g.notes), ...pluralEntryNotes]) };
}

// ---------- adjectives ----------

const FEMININE_RULES = [
  ['eux', 'euse', '-eux → -euse'], ['ien', 'ienne', '-ien → -ienne'], ['éen', 'éenne', '-éen → -éenne'],
  ['ier', 'ière', '-ier → -ière'], ['er', 'ère', '-er → -ère'], ['el', 'elle', '-el → -elle'], ['eil', 'eille', '-eil → -eille'],
  ['if', 'ive', '-if → -ive'], ['f', 've', '-f → -ve'], ['on', 'onne', '-on → -onne'], ['et', 'ette', '-et → -ette'],
  ['c', 'que', '-c → -que'],
];

export function feminineRule(masc, fem) {
  if (masc === fem) return masc.endsWith('e') ? `adjectives ending in -e stay the same (${masc} → ${fem}).` : `${masc} doesn't change in the feminine.`;
  for (const [ending, femEnding, description] of FEMININE_RULES) {
    if (masc.endsWith(ending) && fem === masc.slice(0, -ending.length) + femEnding) return `${description} (${masc} → ${fem}).`;
  }
  if (fem === `${masc}e`) return `general rule: add -e (${masc} → ${fem}).`;
  return `irregular feminine — learn it by heart (${masc} → ${fem}).`;
}

function splitAdjectiveForms(text, entry) {
  let parts = withoutTrailingPunctuation(text).split(/\s*[/,;]\s*|\s+[-–—]\s+/).map((s) => s.trim()).filter(Boolean);
  const formsHaveHyphen = [entry.masc, entry.fem].some((f) => f && f.includes('-'));
  if (parts.length === 1 && parts[0].includes('-') && !formsHaveHyphen) parts = parts[0].split('-').map((s) => s.trim()).filter(Boolean);
  return parts;
}

function gradeAdjectiveAgainst(forms, candidate) {
  const { masc, fem } = candidate;
  const both = masc ? (masc === fem ? masc : `${masc} / ${fem}`) : fem;
  if (!masc || masc === fem) {
    const target = fem;
    const comparisons = forms.slice(0, 2).map((f) => compareText(f, target));
    const worst = comparisons.reduce((w, c) => (KIND_RANK[c.kind] < KIND_RANK[w.kind] ? c : w));
    if (worst.kind === 'different') return { result: 'wrong', notes: [], different: true };
    return { result: kindToResult(worst.kind), notes: comparisonNotes(worst) };
  }
  if (forms.length === 1) {
    const cmp = bestComparison([compareText(forms[0], masc, masc), compareText(forms[0], fem, fem)]);
    if (cmp.kind === 'different') return { result: 'wrong', notes: [], different: true };
    return { result: 'partial', notes: [`Give both forms: **${both}**.`, ...comparisonNotes(cmp)] };
  }
  const [userMasc, userFem] = forms;
  const mascCmp = compareText(userMasc, masc, masc);
  const femCmp = compareText(userFem, fem, fem);
  if (mascCmp.kind !== 'exact' && femCmp.kind !== 'exact'
      && compareText(userMasc, fem).kind === 'exact' && compareText(userFem, masc).kind === 'exact') {
    return { result: 'correct', notes: [`Tip: masculine first — **${both}**.`] };
  }
  if (mascCmp.kind === 'different' && femCmp.kind === 'different') return { result: 'wrong', notes: [], different: true };
  const notes = [...comparisonNotes(mascCmp)];
  if (femCmp.kind === 'accent') notes.push(...comparisonNotes(femCmp));
  else if (femCmp.kind !== 'exact') notes.push(`Feminine: **${fem}** — ${feminineRule(masc, fem)}`);
  const results = [kindToResult(mascCmp.kind), kindToResult(femCmp.kind)];
  const result = results.every((r) => r === 'correct') ? 'correct' : results.every((r) => r === 'wrong') ? 'wrong' : 'partial';
  return { result, notes };
}

// "(m)", "(f)", "(m/f)", "(m / f)", "(m,f)", "(mf)", "(f/m)", "(fm)". Only bracketed ones: a bare word could be
// a real form ("masculin / masculine"). For adjectives the forms already show the gender, so markers are ignored.
const BRACKETED_GENDER_MARKER = /\s*\(\s*(?:m|f)(?:\s*[\/,]?\s*(?:m|f))?\s*\)/g;
const withoutGenderMarkers = (text) => text.replace(BRACKETED_GENDER_MARKER, '');

function gradeAdjective(entry, raw, ctx) {
  const forms = splitAdjectiveForms(withoutGenderMarkers(normalizeText(raw)), entry);
  const candidates = [
    { masc: entry.masc && normalizeText(entry.masc), fem: normalizeText(entry.fem) },
    ...(entry.alt || []).map((a) => { const [m, f] = withoutGenderMarkers(a).split('/').map(normalizeText); return { masc: m, fem: f || m }; }),
  ];
  const grade = bestGrade(candidates.map((c) => gradeAdjectiveAgainst(forms, c)));
  if (grade.different) return gradeAsOtherWord(entry, raw, forms[0] || '', ctx) || { result: 'wrong', notes: [] };
  if (grade.result !== 'correct' && forms.length) {
    // A near-spelling that is really another word; the entry's own forms (géniale for génial) never count
    const ownForms = [entry.masc, entry.fem].filter(Boolean).map(normalizeText);
    const otherEntry = ctx.lookup?.find(forms[0], entry.id, 'adjective');
    if (otherEntry && !ownForms.includes(forms[0]) && compareText(forms[0], normalizeText(entry.masc || entry.fem)).kind === 'close') {
      // null inside a nested lookup: then this entry's own grade stands
      return gradeAsOtherWord(entry, raw, forms[0], ctx) || grade;
    }
  }
  return grade;
}

// ---------- verbs ----------

const SUBJECT_PRONOUN = /^(il\/elle\/on|il\/elle|elle\/il|ils\/elles|elles\/ils|je|tu|il|elle|on|nous|vous|ils|elles)\s+/;

function splitVerbAnswer(raw) {
  let parts = String(raw ?? '').split(/\r?\n|[,;:]|\s[-–—]\s/)
    .map((p) => withoutTrailingPunctuation(normalizeText(p))).filter(Boolean);
  if (parts.length === 1) {
    const tokens = parts[0].split(' ');
    if (tokens.length === 6 || tokens.length === 7) parts = tokens;
  }
  return parts;
}

function compareVerbForm(userForm, acceptedForms) {
  const userOptions = unique([userForm, userForm.replace(SUBJECT_PRONOUN, ''), userForm.replace(/^j'/, '')]);
  return bestComparison(acceptedForms.flatMap((accepted) => {
    const expectedOptions = unique([accepted, accepted.replace(/^j'/, '')]);
    return userOptions.flatMap((u) => expectedOptions.map((e) => compareText(u, e, accepted)));
  }));
}

function boldFirst(text, pattern) {
  return text.replace(pattern, (m) => `**${m}**`);
}

export function verbRuleNote(entry, wrongIndices) {
  if (!wrongIndices.length) return null;
  const wrong = new Set(wrongIndices);
  const [je, tu, il, nous, vous, ils] = entry.conj;
  const stem = entry.infinitive.slice(0, -2);
  switch (entry.rule) {
    case '-ger':
      return wrong.has(3) ? `-ger verbs keep the **e** before -ons: nous ${boldFirst(nous, /e(?=ons$)/)} (it keeps the soft g sound).` : null;
    case '-cer':
      return wrong.has(3) ? `-cer verbs take a **ç** before -ons: nous ${boldFirst(nous, /ç/)} (it keeps the soft c sound).` : null;
    case '-yer':
      return `**y → i** except with nous and vous: je ${boldFirst(je, /i/)}, tu ${boldFirst(tu, /i/)}, il ${boldFirst(il, /i/)}, ils ${boldFirst(ils, /i/)} — but nous ${nous}, vous ${vous}.`;
    case 'double-l':
      return `Double **l** except with nous and vous: ${withPronoun(boldFirst(je, /ll/), 0)}, tu ${boldFirst(tu, /ll/)}, il ${boldFirst(il, /ll/)}, ils ${boldFirst(ils, /ll/)} — but nous ${nous}, vous ${vous}.`;
    case 'é→è':
      return `**é → è** except with nous and vous: je ${boldFirst(je, /è/)}, tu ${boldFirst(tu, /è/)}, il ${boldFirst(il, /è/)}, ils ${boldFirst(ils, /è/)} — but nous ${nous}, vous ${vous}.`;
    case 'e→è':
      return `**e → è** except with nous and vous: ${withPronoun(boldFirst(je, /è/), 0)}, tu ${boldFirst(tu, /è/)}, il ${boldFirst(il, /è/)}, ils ${boldFirst(ils, /è/)} — but nous ${nous}, vous ${vous}.`;
    case '-ir-iss':
      return `Regular -ir verb: je ${stem}**is**, tu ${stem}**is**, il ${stem}**it**, nous ${stem}**iss**ons, vous ${stem}**iss**ez, ils ${stem}**iss**ent.`;
    case '-re':
      return `-re verb: endings -s, -s, (nothing), -ons, -ez, -ent: je ${je}, il ${il}, nous ${nous}.`;
    case 'irregular':
      return `**${entry.infinitive}** is irregular — learn these six forms by heart.`;
    default:
      return entry.infinitive.endsWith('er') ? 'Regular -er verb: drop -er and add -e, -es, -e, -ons, -ez, -ent.' : null;
  }
}

function verbPatternDescription(entry) {
  const [je, , , nous] = entry.conj;
  if (entry.rule === '-ir-iss') return `a regular -ir verb (je ${je}, nous ${nous}).`;
  if (entry.rule === 'irregular') return `an irregular verb (${withPronoun(je, 0)}, nous ${nous}).`;
  return `${withPronoun(je, 0)}, nous ${nous}.`;
}

function gradeVerb(entry, raw, ctx) {
  const parts = splitVerbAnswer(raw);
  const expectedInfinitive = normalizeText(entry.infinitive);
  const looksLikeInfinitive = (p) => /(er|ir|re)$/.test(p) || compareText(p, expectedInfinitive).kind !== 'different';
  let infinitive = null;
  let forms;
  if (parts.length >= 7) { infinitive = parts[0]; forms = parts.slice(1, 7); }
  else if (parts.length !== 6 && parts.length > 0 && looksLikeInfinitive(parts[0])) { infinitive = parts[0]; forms = parts.slice(1); }
  else forms = parts;

  const notes = [];
  let infinitiveResult = 'correct';
  let madeUpVerb = false;
  if (infinitive !== null) {
    const cmp = compareText(infinitive, expectedInfinitive, entry.infinitive);
    const otherVerb = cmp.kind !== 'exact' && ctx.lookup?.find(infinitive, entry.id, 'verb');
    if (otherVerb && cmp.kind !== 'accent') return gradeAsOtherWord(entry, raw, infinitive, ctx, { type: 'verb' });
    if (cmp.kind !== 'exact' && infinitive.endsWith('er') && !expectedInfinitive.endsWith('er')) {
      madeUpVerb = true;
      infinitiveResult = 'wrong';
      notes.push(`"${infinitive}" isn't a French verb. ${capitalize(entry.en)} is **${entry.infinitive}** — ${verbPatternDescription(entry)}`);
    } else if (cmp.kind === 'different') {
      notes.push(`The infinitive is **${entry.infinitive}**.`);
      infinitiveResult = 'wrong';
    } else if (cmp.kind !== 'exact') {
      notes.push(...comparisonNotes(cmp));
      infinitiveResult = 'partial';
    } else notes.push(...comparisonNotes(cmp));
  }

  if (forms.length === 0) {
    notes.push(`Give the full conjugation: **${formatAnswer(entry)}**.`);
    return { result: infinitiveResult === 'correct' ? 'partial' : 'wrong', notes };
  }

  const comparisons = entry.conj.map((_, i) => (forms[i] === undefined ? { kind: 'missing' } : compareVerbForm(forms[i], acceptedVerbForms(entry, i).map(normalizeText))));
  const wrongIndices = comparisons.map((c, i) => (c.kind === 'exact' ? -1 : i)).filter((i) => i >= 0);
  const missing = wrongIndices.filter((i) => comparisons[i].kind === 'missing');
  const mistaken = wrongIndices.filter((i) => comparisons[i].kind !== 'missing');
  if (comparisons.some((c) => c.usedOe)) notes.push(OE_NOTE);

  if (mistaken.length) {
    const describe = (i) => `**${PRONOUNS[i]}**: you wrote "${forms[i]}" → **${entry.conj[i]}**${comparisons[i].kind === 'accent' ? ' (accent)' : ''}`;
    const list = mistaken.map(describe).join('; ');
    notes.push(mistaken.length === 1 && !missing.length ? `Only ${list}.` : `Wrong: ${list}.`);
  }
  if (missing.length) notes.push(`Missing: ${missing.map((i) => PRONOUNS[i]).join(', ')}.`);
  const ruleNote = verbRuleNote(entry, wrongIndices);
  if (ruleNote && !madeUpVerb) notes.push(ruleNote);
  if (infinitive === null && forms.length === 6) notes.push(`Tip: start with the infinitive: **${entry.infinitive}**, ${entry.conj[0]}, …`);

  const correctCount = 6 - wrongIndices.length;
  const onlySmallSlips = wrongIndices.every((i) => ['accent', 'close'].includes(comparisons[i].kind));
  let formsResult = 'wrong';
  if (correctCount === 6) formsResult = 'correct';
  else if (correctCount >= 4 || onlySmallSlips) formsResult = 'partial';
  if (infinitiveResult === 'wrong' && formsResult === 'correct') return { result: 'partial', notes };
  return { result: worstResult(formsResult, infinitiveResult === 'wrong' ? 'partial' : infinitiveResult), notes };
}

// ---------- expressions & numbers ----------

function gradePlain(entry, raw, ctx) {
  const text = withoutPunctuation(normalizeText(raw));
  const candidates = [entry.fr, ...(entry.alt || [])];
  const comparisons = candidates.map((c) => compareText(text, withoutPunctuation(normalizeText(c)), c));
  const cmp = bestComparison(comparisons);
  if (cmp.kind === 'accent') {
    const accentPairGrade = gradeAsAccentPairWord(text, withoutPunctuation(normalizeText(entry.fr)));
    if (accentPairGrade) return accentPairGrade;
  }
  if (entry.type === 'number' && cmp.kind !== 'exact') {
    const flatten = (s) => s.replace(/-/g, ' ').replace(/\s+/g, ' ');
    if (flatten(text) === flatten(normalizeText(entry.fr))) {
      return { result: 'correct', notes: [`Fine! Your notes spell it **${entry.fr}**.`] };
    }
  }
  if (cmp.kind === 'different' || cmp.kind === 'close') {
    const asOtherWord = gradeAsOtherWord(entry, raw, text, ctx);
    if (asOtherWord || cmp.kind === 'different') return asOtherWord || { result: 'wrong', notes: [] };
  }
  return { result: kindToResult(cmp.kind), notes: comparisonNotes(cmp) };
}

// ---------- sentence fill-ins ----------
// Every form of an entry that can stand in a sentence, with its "slot": what the sentence needs from the word there.
//   nouns, countries: { gender: m|f|mf, plural, elides }   adjectives: { gender: m|f|mf, plural }
//   verbs: { person: 0–5 | 'infinitive' | 'imperative-tu|nous|vous', keepsS?, pronounBefore? }   expressions: {}
// plural null = the same spelling in the singular and plural (le bus / les bus); elides = starts with a vowel or silent h
// (l'ami), null when unknown (an h with no article to tell). Gender mf = one spelling for both genders.
// The blank of a fill-in has the slot of the form that was cut out of the sentence: that form's gender is the
// gender the sentence uses, so other forms are only accepted when they fit the same slot.

export const BLANK = '______';
const VOWEL_START = /^[aeiouyâàäéèêëîïôöûùüœæ]/;
const GENDER_FLEXIBLE_TYPES = new Set(['noun', 'country', 'adjective']);
// Words that change before a vowel (le → l', de → d', ce → cet, ma → mon…): after them the blank can't start with one
const WORDS_THAT_CHANGE_BEFORE_A_VOWEL = new Set(['le', 'la', 'de', 'du', 'au', 'ce', 'ma', 'ta', 'sa', 'que', 'je', 'ne', 'me', 'te', 'se']);
const SUBJECT_PRONOUN_OF_PERSON = { 0: 'je', 1: 'tu', 3: 'nous', 4: 'vous' };

// Plural spellings: +s; +x or +s after -au / -eu / -ou; unchanged after -s / -x / -z
function pluralForms(word) {
  if (/[sxz]$/i.test(word)) return [word];
  if (/(au|eu|ou)$/i.test(word)) return [`${word}x`, `${word}s`];
  return [`${word}s`];
}

function elides(article, word) {
  if (article === "l'") return true;
  if (['le', 'la', 'le/la'].includes(article)) return false;
  if (/^h/i.test(word)) return null;
  return VOWEL_START.test(word.toLowerCase());
}

// The singular and its plurals; a spelling that is both gets plural: null
function withPlurals(word, slot) {
  const forms = [{ form: word, slot: { ...slot, plural: false } }];
  for (const plural of pluralForms(word)) {
    const same = forms.find((f) => f.form === plural);
    if (same) same.slot.plural = null;
    else forms.push({ form: plural, slot: { ...slot, plural: true } });
  }
  return forms;
}

function nounFillInForms(entry) {
  const main = { article: entry.article, word: entry.fr, gender: entry.gender, fromAlt: false };
  const alternatives = (entry.alt || []).map((altText) => {
    const parsed = parseNounAnswer(normalizeText(altText));
    return { article: parsed.article ?? '', word: parsed.word, gender: parsed.gender || ARTICLE_GENDER[parsed.article] || entry.gender, fromAlt: true };
  });
  return [main, ...alternatives].flatMap(({ article, word, gender, fromAlt }) => {
    const slot = { gender, elides: elides(article, word) };
    const forms = ['les', 'des'].includes(article) ? [{ form: word, slot: { ...slot, plural: true } }]
      : entry.type === 'country' ? [{ form: word, slot: { ...slot, plural: false } }]
      : withPlurals(word, slot);
    return forms.map((f) => ({ ...f, hint: null, fromAlt }));
  });
}

function adjectiveFillInForms(entry) {
  const main = { masc: entry.masc, fem: entry.fem, fromAlt: false };
  const alternatives = (entry.alt || []).map((altText) => {
    const [masc, fem] = withoutGenderMarkers(altText).split('/').map((s) => s.trim());
    return { masc, fem: fem || masc, fromAlt: true };
  });
  return [main, ...alternatives].flatMap(({ masc, fem, fromAlt }) => {
    const byGender = !masc ? [[fem, 'f']] : masc === fem ? [[masc, 'mf']] : [[masc, 'm'], [fem, 'f']];
    return byGender.flatMap(([word, gender]) => withPlurals(word, { gender }).map((f) => ({ ...f, hint: masc || fem, fromAlt })));
  });
}

// { form, slot, hint, fromAlt } for every spelling of the entry that a sentence can contain
export function fillInForms(entry) {
  switch (entry.type) {
    case 'verb':
      return entry.conj.flatMap((_, person) => acceptedVerbForms(entry, person).map((form) => ({ form: form.replace(/^j'/, ''), slot: { person } })))
        .concat(imperativeForms(entry), [{ form: entry.infinitive, slot: { person: 'infinitive' } }])
        .map((f) => ({ ...f, hint: entry.infinitive, fromAlt: false }));
    case 'adjective':
      return adjectiveFillInForms(entry);
    case 'noun':
    case 'country':
      return nounFillInForms(entry);
    case 'expression':
      return [entry.fr, ...(entry.alt || [])].map((text, index) => ({
        form: text.replace(/…/g, '').replace(/[\s.!?]+$/, ''), slot: {}, hint: null, fromAlt: index > 0,
      }));
    default:
      return [];
  }
}

// ---------- the imperative in fill-ins ----------
// Imperative forms are taken from the present tu / nous / vous forms (conj, conjAlt):
//   tu drops the s of -es (all -er verbs, ouvrir, découvrir…) and vas → va, but keeps it before -y / -en (vas-y, penses-y);
//   reflexive verbs: pronoun after the verb without ne (lève-toi), in front with ne (ne te lève pas).
// A blank is an imperative when no subject comes before it in its clause (only ne and object pronouns may: "Ne ______ pas"),
// or when a pronoun is hyphenated after it ("______-moi"), and its sentence isn't a question.

const IMPERATIVE_PERSON_OF_PRESENT = { 1: 'imperative-tu', 3: 'imperative-nous', 4: 'imperative-vous' };
const IMPERATIVE_PRONOUN = { 'imperative-tu': 'tu', 'imperative-nous': 'nous', 'imperative-vous': 'vous' };
export const isImperativePerson = (person) => Object.hasOwn(IMPERATIVE_PRONOUN, person);
// The only French verbs whose imperative isn't the present form ([tu, nous, vous]); the list is closed
const IRREGULAR_IMPERATIVES = {
  'être': ['sois', 'soyons', 'soyez'],
  avoir: ['aie', 'ayons', 'ayez'],
  savoir: ['sache', 'sachons', 'sachez'],
  vouloir: ['veuille', 'veuillons', 'veuillez'],
};
const REFLEXIVE_PRONOUN_AND_VERB = /^(te |t'|nous |vous )(.+)$/;
const tuImperative = (presentForm) => (presentForm === 'vas' ? 'va' : /es$/.test(presentForm) ? presentForm.slice(0, -1) : presentForm);

// { form, slot } for the imperative. keepsS: a tu form that is only right before -y / -en (true) or only elsewhere (false);
// pronounBefore: a reflexive form with its pronoun in front (with ne: te lève) or without it (before -toi: lève)
export function imperativeForms(entry) {
  const irregular = IRREGULAR_IMPERATIVES[entry.infinitive];
  if (irregular) return Object.values(IMPERATIVE_PERSON_OF_PRESENT).map((person, i) => ({ form: irregular[i], slot: { person } }));
  const reflexive = REFLEXIVE_PRONOUN_AND_VERB.test(entry.conj[1]);
  return Object.entries(IMPERATIVE_PERSON_OF_PRESENT).flatMap(([presentIndex, person]) =>
    acceptedVerbForms(entry, Number(presentIndex)).flatMap((present) => {
      const isTu = person === 'imperative-tu';
      if (reflexive) {
        const [, pronoun, verb] = present.match(REFLEXIVE_PRONOUN_AND_VERB);
        const imperativeVerb = isTu ? tuImperative(verb) : verb;
        return [{ form: pronoun + imperativeVerb, slot: { person, pronounBefore: true } }, { form: imperativeVerb, slot: { person, pronounBefore: false } }];
      }
      if (!isTu || tuImperative(present) === present) return [{ form: present, slot: { person } }];
      return [{ form: tuImperative(present), slot: { person, keepsS: false } }, { form: present, slot: { person, keepsS: true } }];
    }));
}

// Before an imperative in its clause: nothing, or ne followed by object pronouns ("Ne le ______ pas"). Without ne,
// a pronoun in front is the subject: "Nous ______ à midi".
const OBJECT_PRONOUNS_AFTER_NE = new Set(['me', "m'", 'te', "t'", 'le', 'la', "l'", 'les', 'lui', 'leur', 'nous', 'vous', 'y', 'en']);
const fitsBeforeAnImperative = (clauseBefore) => {
  const [first, ...rest] = clauseBefore.match(/\p{L}+'?/gu) || [];
  if (clauseBefore.replace(/\p{L}+'?/gu, '').trim()) return false; // digits or symbols: "03/02 ______"
  return !first || (['ne', "n'"].includes(first) && rest.every((w) => OBJECT_PRONOUNS_AFTER_NE.has(w)));
};
const PRONOUN_AFTER_AN_IMPERATIVE = /^-(?:moi|toi|le|la|les|lui|leur|nous|vous|y|en|m'en|t'en|m'y)(?!\p{L})/u;
const TU_CLUES = new Set(['tu', 'te', "t'", 'toi', 'ton', 'ta', 'tes']);
const VOUS_CLUES = new Set(['vous', 'votre', 'vos', 'madame', 'monsieur', 'mademoiselle', 'mesdames', 'messieurs']);
// "Les enfants, …" / "Mes amis, …" at the start of the sentence speaks to several people
const PLURAL_ADDRESS = /^(?:les|mes) \p{L}+ ?,/u;

// The text before and after the blank within its own sentence (a dialogue turn after – counts as one), normalized
function blankSentence(sentence) {
  const at = sentence.indexOf(BLANK);
  const before = normalizeText(sentence.slice(0, at).split(/[.!?…–—]/).pop());
  const rest = normalizeText(sentence.slice(at + BLANK.length));
  const end = rest.search(/[.!?…–—]/);
  return { before, after: end < 0 ? rest : rest.slice(0, end + 1) };
}

// The words that show who is spoken to: { tuClue, vousClue }, each the first clue found or null
function addresseeClues(before, after) {
  const text = `${before} ${after}`;
  const words = text.match(/\p{L}+'?/gu) || [];
  const firstClue = (clueWords) => words.find((w) => clueWords.has(w)) ?? null;
  return {
    tuClue: text.includes("s'il te plaît") ? "s'il te plaît" : firstClue(TU_CLUES),
    vousClue: text.includes("s'il vous plaît") ? "s'il vous plaît"
      : PLURAL_ADDRESS.test(before) ? before.match(PLURAL_ADDRESS)[0].replace(/ ?,$/, '') : firstClue(VOUS_CLUES),
  };
}

// null if the blank is not an imperative; otherwise what the sentence around it shows.
// afterComma: found because the blank starts a clause after a comma (validate.js checks that no subject came earlier)
export function imperativeContext(sentence) {
  const { before, after } = blankSentence(sentence);
  if (after.trimEnd().endsWith('?')) return null;
  const pronounAfter = PRONOUN_AFTER_AN_IMPERATIVE.test(after);
  const clauseBefore = before.split(/[,;:«»"()]/).pop();
  if (!pronounAfter && !fitsBeforeAnImperative(clauseBefore)) return null;
  return {
    pronounAfter,
    beforeYEn: /^-(?:y|en)(?!\p{L})/u.test(after),
    afterComma: !pronounAfter && clauseBefore !== before,
    ...addresseeClues(before, after),
  };
}

// The slot of an imperative blank: the person the sentence was written with, plus the other of tu / vous when nothing
// in the sentence shows who is spoken to. A clue that contradicts the written form is ignored (validate.js warns).
function imperativeBlankSlot(writtenPersons, context) {
  const written = unique(writtenPersons);
  const clue = context.tuClue && !context.vousClue ? { person: 'imperative-tu', word: context.tuClue }
    : context.vousClue && !context.tuClue ? { person: 'imperative-vous', word: context.vousClue } : null;
  const isTuOrVous = written.some((p) => p !== 'imperative-nous');
  const clueFits = !!clue && written.includes(clue.person);
  const persons = isTuOrVous && !clue ? unique([...written, 'imperative-tu', 'imperative-vous']) : written;
  return {
    persons, imperative: true, pronounAfter: context.pronounAfter, beforeYEn: context.beforeYEn, afterComma: context.afterComma,
    clue: isTuOrVous && clueFits ? clue : null,
    clueContradicts: isTuOrVous && !!clue && !clueFits,
    addresseeUnclear: isTuOrVous && !clue, // no clue, or clues for both tu and vous
  };
}

// The slot of the blank, from the form that was cut out. A verb form can be several persons (mange: je and il);
// persons whose subject pronoun isn't in the sentence are dropped ("On ______ à midi" is not the je form).
// In an imperative sentence only the imperative persons count. null = this form can't be the blank here: an
// imperative-only form (sois, sache, lève of se lever) outside an imperative, e.g. the subjunctive "que tu sois".
export function blankSlot(entry, blankedText, formSlot, sentence) {
  if (entry.type !== 'verb') return formSlot;
  const blanked = normalizeText(blankedText);
  const matching = fillInForms(entry).filter((f) => normalizeText(f.form) === blanked).map((f) => f.slot.person);
  const imperativePersons = matching.filter(isImperativePerson);
  const context = imperativePersons.length ? imperativeContext(sentence) : null;
  if (context) return imperativeBlankSlot(imperativePersons, context);
  const persons = matching.filter((p) => !isImperativePerson(p));
  if (!persons.length) return null;
  const words = normalizeText(sentence).split(/[^\p{L}']+/u);
  const pronounInSentence = (pronoun) => words.includes(pronoun) || (pronoun === 'je' && words.some((w) => w.startsWith("j'")));
  const narrowed = persons.filter((p) => !SUBJECT_PRONOUN_OF_PERSON[p] || pronounInSentence(SUBJECT_PRONOUN_OF_PERSON[p]));
  return { persons: unique(narrowed.length ? narrowed : persons) };
}

// The word right before the blank as written ("l'", "d'", "le", "mon"), or null
export function wordBeforeBlank(sentence) {
  const before = normalizeText(sentence.slice(0, sentence.indexOf(BLANK)));
  return before.match(/(\p{L}+'?)$/u)?.[1] ?? null;
}

// true: the blank needs a word starting with a vowel or silent h (l'___, d'___); false: one that doesn't (le ___); null: either
function elisionAfter(word) {
  if (!word) return null;
  if (word.endsWith("'")) return true;
  return WORDS_THAT_CHANGE_BEFORE_A_VOWEL.has(word) ? false : null;
}

// Why a form doesn't fit the blank (person | imperative-s | pronoun-place | number | gender | elision), or null if it fits
function slotMismatch(formSlot, blank, sentenceContext) {
  if ('persons' in blank) {
    if (!blank.persons.includes(formSlot.person)) return 'person';
    if (formSlot.keepsS != null && formSlot.keepsS !== blank.beforeYEn) return 'imperative-s';
    if (formSlot.pronounBefore != null && formSlot.pronounBefore === blank.pronounAfter) return 'pronoun-place';
    return null;
  }
  if (formSlot.plural != null && blank.plural != null && formSlot.plural !== blank.plural) return 'number';
  if (!sentenceContext.eitherGender && formSlot.gender !== 'mf' && formSlot.gender !== blank.gender) return 'gender';
  if (sentenceContext.needsElision != null && formSlot.elides != null && formSlot.elides !== sentenceContext.needsElision) return 'elision';
  return null;
}

// The entry's own forms and those of its acceptedSynonyms, each with mismatch = why it doesn't fit (null if it does).
// Expressions: only the wording in the sentence is this entry's answer, unless the example has anyWording (then all
// its wordings are); a synonym expression replaces it whole.
function fillInCandidates(entry, fillIn, sentenceContext, ctx) {
  const blanked = normalizeText(fillIn.answer);
  const anyWording = fillIn.example?.anyWording === true;
  const describe = (owner, isSynonym) => (f) => {
    const text = normalizeText(f.form);
    const mismatch = entry.type === 'expression'
      ? (isSynonym || anyWording || text === blanked ? null : 'form')
      : slotMismatch(f.slot, fillIn.slot, sentenceContext);
    return { ...f, text, owner, isSynonym, mismatch };
  };
  const own = fillInForms(entry).map(describe(entry, false));
  const synonyms = (ctx.lookup?.synonymsOf(entry) || []).flatMap((other) => fillInForms(other).map(describe(other, true)));
  return [...own, ...synonyms];
}

function bestCandidateMatch(typed, candidates) {
  return candidates.map((candidate) => ({ candidate, cmp: compareText(typed, candidate.text, candidate.form) }))
    .reduce((best, match) => (!best || KIND_RANK[match.cmp.kind] > KIND_RANK[best.cmp.kind] ? match : best), null);
}
const matchRank = (match) => (match ? KIND_RANK[match.cmp.kind] : -1);

const personName = (person) => (person === 'infinitive' ? 'the infinitive'
  : isImperativePerson(person) ? `the **${IMPERATIVE_PRONOUN[person]}** imperative` : `the **${PRONOUNS[person]}** form`);

// The note for one of the entry's own forms that doesn't fit an imperative blank
function imperativeMismatchNote(entry, fillIn, candidate) {
  const answer = `**${fillIn.answer}**`;
  const blank = fillIn.slot;
  const { person } = candidate.slot;
  if (candidate.mismatch === 'imperative-s') {
    return blank.beforeYEn ? `Before **y** and **en**, the tu imperative keeps its **s**: ${answer}.`
      : `In the imperative, the tu form drops its **s**: ${answer}, not ${candidate.form}.`;
  }
  if (candidate.mismatch === 'pronoun-place') {
    return blank.pronounAfter ? `Without **ne**, the pronoun goes after the verb: ${answer}.` : `With **ne**, the pronoun stays in front of the verb: ${answer}.`;
  }
  if (isImperativePerson(person)) {
    if (blank.persons.every((p) => p === 'imperative-nous')) return `That's ${personName(person)}. The sentence says *let's*, so it's the **nous** form: ${answer}.`;
    if (person === 'imperative-nous') return `That's the **nous** imperative (let's…). Here you need ${answer}.`;
    if (blank.clue) return `That's ${personName(person)}. **${blank.clue.word}** shows it's ${IMPERATIVE_PRONOUN[blank.clue.person]} here: ${answer}.`;
    return `That's ${personName(person)}. Here you need ${answer}.`;
  }
  const irregular = IRREGULAR_IMPERATIVES[entry.infinitive];
  if (irregular && [1, 3, 4].includes(person)) return `The imperative of **${entry.infinitive}** is irregular (${irregular.join(', ')}): here it's ${answer}.`;
  return `That's ${personName(person)} of ${entry.infinitive}. Here you need the imperative: ${answer}.`;
}

// The note for a right word that doesn't fit this sentence
function fillInMismatchNote(entry, fillIn, candidate, before) {
  const answer = `**${fillIn.answer}**`;
  const blank = fillIn.slot;
  if (blank.imperative && !candidate.isSynonym) return imperativeMismatchNote(entry, fillIn, candidate);
  if (candidate.isSynonym) {
    const reason = {
      person: `that's ${personName(candidate.slot.person)}`,
      'imperative-s': blank.beforeYEn ? 'before y and en the tu imperative keeps its s' : 'in the imperative the tu form drops its s',
      'pronoun-place': blank.pronounAfter ? 'without ne the pronoun goes after the verb' : 'with ne the pronoun stays in front of the verb',
      number: `the sentence needs the ${blank.plural ? 'plural' : 'singular'}`,
      gender: blank.gender === 'mf' ? `${answer} is the same in both genders, so this sentence can't check the gender of **${candidate.form}**`
        : `it's ${genderName(candidate.slot.gender)} and the sentence uses the ${genderName(blank.gender)}`,
      elision: `it doesn't fit after **${before}**`,
    }[candidate.mismatch];
    return `**${shortName(candidate.owner)}** (${candidate.owner.en}) is also right on its own, but ${reason}: here it's ${answer}.`;
  }
  switch (candidate.mismatch) {
    case 'person':
      return `That's ${personName(candidate.slot.person)} of ${entry.infinitive}. Here you need ${answer}.`;
    case 'form':
      return `**${candidate.form}** is another form of this expression, but the sentence uses ${answer}.`;
    case 'elision':
      return `**${candidate.form}** is right, but it doesn't fit after **${before}**: here it's ${answer}.`;
    default:
      if (entry.type === 'adjective') {
        const femNote = entry.masc && entry.masc !== entry.fem ? ` Feminine: ${feminineRule(entry.masc, entry.fem)}` : '';
        return `Right word, but it must agree with the noun here: ${answer}.${femNote}`;
      }
      if (candidate.mismatch === 'number') return `Right word — but here it's ${answer} (singular / plural).`;
      return blank.gender === 'mf' ? `Here it's ${answer}.` : `The sentence uses the ${genderName(blank.gender)}: ${answer}.`;
  }
}

function gradeFillIn(entry, fillIn, raw, ctx) {
  const isNoun = entry.type === 'noun' || entry.type === 'country';
  const before = wordBeforeBlank(fillIn.sentence);
  const sentenceContext = {
    eitherGender: fillIn.example?.eitherGender === true && GENDER_FLEXIBLE_TYPES.has(entry.type),
    needsElision: isNoun ? elisionAfter(before) : null,
  };
  const candidates = fillInCandidates(entry, fillIn, sentenceContext, ctx);
  const fitting = candidates.filter((c) => !c.mismatch);
  let typed = withoutTrailingPunctuation(normalizeText(raw));
  if (isNoun) {
    // The article is already in the sentence, but typing it too is fine: "l'évènement"
    const withoutArticle = typed.replace(/^(?:(?:le|la|les)\s+|l')/, '');
    if (withoutArticle !== typed && matchRank(bestCandidateMatch(withoutArticle, candidates)) >= matchRank(bestCandidateMatch(typed, candidates))) {
      typed = withoutArticle;
    }
  }
  // The conjugation rule of the persons the blank needs; in an imperative only nous / vous, which are the present forms
  const persons = !fillIn.slot.imperative ? fillIn.slot.persons?.filter(Number.isInteger) || []
    : fillIn.slot.persons.includes('imperative-tu') || IRREGULAR_IMPERATIVES[entry.infinitive] ? []
    : fillIn.slot.persons.map((p) => ({ 'imperative-nous': 3, 'imperative-vous': 4 })[p]);
  const rule = persons.length ? verbRuleNote(entry, persons) : null;

  const match = bestCandidateMatch(typed, fitting);
  if (match?.cmp.kind === 'exact') {
    const { candidate } = match;
    if (candidate.isSynonym) return { result: 'correct', notes: [synonymNote(entry, candidate.owner), ...comparisonNotes(match.cmp)] };
    const otherGender = sentenceContext.eitherGender && candidate.slot.gender !== 'mf' && candidate.slot.gender !== fillIn.slot.gender;
    return { result: 'correct', notes: [...comparisonNotes(match.cmp), otherGender && 'Either gender works in this sentence.'].filter(Boolean) };
  }
  const accentPairGrade = match?.cmp.kind === 'accent' && gradeAsAccentPairWord(typed, normalizeText(fillIn.answer));
  if (accentPairGrade) return accentPairGrade;

  // A right word that doesn't fit the sentence: wrong person, gender, number, or elision (l'___), or another wording
  // (own forms before synonyms; in an imperative, imperative forms first: pensez is the vous imperative, not the vous form)
  const mismatchOrder = (c) => (c.isSynonym ? 2 : 0) + (fillIn.slot.imperative && !isImperativePerson(c.slot.person) ? 1 : 0);
  const unfitting = candidates.filter((c) => c.mismatch && compareText(typed, c.text).kind === 'exact')
    .sort((a, b) => mismatchOrder(a) - mismatchOrder(b))[0];
  if (unfitting) {
    const showRule = !unfitting.isSynonym && !fillIn.slot.imperative;
    return { result: 'partial', notes: [fillInMismatchNote(entry, fillIn, unfitting, before), showRule ? rule : null].filter(Boolean) };
  }
  if (fillIn.slot.imperative) {
    const withoutSubject = typed.replace(/^(?:je |j'|tu |il |elle |on |nous |vous |ils |elles )/, '');
    if (withoutSubject !== typed && candidates.some((c) => !c.isSynonym && compareText(withoutSubject, c.text).kind === 'exact')) {
      return { result: 'partial', notes: [`No subject pronoun in the imperative: **${fillIn.answer}**.`] };
    }
  }
  const otherWordOptions = { type: entry.type === 'verb' ? 'verb' : undefined, acceptSynonyms: false, inSentence: true };
  // A near spelling that is really another vocab word, spelt exactly (avant for devant), counts as that word, as on the cards
  const asOtherWord = match?.cmp.kind === 'close' ? gradeAsOtherWord(entry, raw, typed, ctx, { ...otherWordOptions, sameAccents: true }) : null;
  if (asOtherWord) return asOtherWord;
  if (match && match.cmp.kind !== 'different') {
    return { result: 'partial', notes: [match.candidate.isSynonym && synonymNote(entry, match.candidate.owner), ...comparisonNotes(match.cmp), rule].filter(Boolean) };
  }
  return gradeAsOtherWord(entry, raw, typed, ctx, otherWordOptions) || { result: 'wrong', notes: [rule].filter(Boolean) };
}

// ---------- entry points ----------

function gradeEntry(entry, raw, ctx) {
  switch (entry.type) {
    case 'noun':
    case 'country':
      return gradeNoun(entry, raw, ctx);
    case 'adjective':
      return gradeAdjective(entry, raw, ctx);
    case 'verb':
      return gradeVerb(entry, raw, ctx);
    default:
      return gradePlain(entry, raw, ctx);
  }
}

// item: { entry, fillIn? }. Returns { result, correctAnswer, notes, showExample }
export function gradeItem(item, raw, ctx = {}) {
  const { entry, fillIn } = item;
  const correctAnswer = fillIn ? fillIn.answer : formatAnswer(entry);
  if (isDontKnow(raw)) {
    return { result: 'wrong', correctAnswer, notes: [entry.tip].filter(Boolean), showExample: true };
  }
  const grade = fillIn ? gradeFillIn(entry, fillIn, raw, ctx) : gradeEntry(entry, raw, ctx);
  const notes = [...grade.notes];
  if (grade.result !== 'correct' && entry.tip) notes.push(`💡 ${entry.tip}`);
  if (grade.result === 'correct') notes.push(kindsNote(entry, ctx.lookup));
  return { result: grade.result, correctAnswer, notes: unique(notes.filter(Boolean)), showExample: grade.result !== 'correct' };
}
