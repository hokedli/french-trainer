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

// The main form for one person (0 = je … 5 = ils) followed by its accepted alternatives from conjAlt.
export const acceptedVerbForms = (entry, personIndex) => [entry.conj[personIndex], ...(entry.conjAlt?.[personIndex] || [])];

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

// Why entry's synonymOf link to otherId is invalid, or null. Confusables are never accepted as each other's answer,
// and an id is only ever one of kindOf / synonymOf / confusables / alt for an entry.
export function synonymLinkProblem(entry, otherId, byId) {
  const other = byId.get(otherId);
  if (!other) return 'is not an id in vocab.json';
  if (other.id === entry.id) return 'points to the entry itself';
  if (other.type !== entry.type) return `is a ${other.type}, not a ${entry.type}`;
  if ((entry.confusables || []).includes(other.id) || (other.confusables || []).includes(entry.id)) return 'is also a confusable';
  if (entry.kindOf === other.id || other.kindOf === entry.id || (entry.kindOf && entry.kindOf === other.kindOf)) {
    return 'is linked by kindOf (base word or another kind of it)';
  }
  return null;
}

// synonymOf links, one direction: entry → ids whose answers are also right on its card. Invalid links are logged and ignored.
function buildSynonymLinks(words, byId) {
  const synonymIdsById = new Map();
  for (const entry of words) {
    const validIds = new Set();
    for (const otherId of entry.synonymOf || []) {
      const problem = synonymLinkProblem(entry, otherId, byId);
      if (problem) console.warn(`vocab: ${entry.id} has synonymOf "${otherId}", which ${problem} — link ignored`);
      else validIds.add(otherId);
    }
    if (validIds.size) synonymIdsById.set(entry.id, validIds);
  }
  return synonymIdsById;
}

// Reverse index from every accepted answer to the entries it belongs to, plus the kindOf and synonymOf links.
export function buildLookup(words) {
  const byForm = new Map();
  for (const entry of words) {
    for (const form of formsForLookup(entry)) {
      if (!form) continue;
      const key = lookupKey(form);
      if (!byForm.has(key)) byForm.set(key, []);
      if (!byForm.get(key).includes(entry)) byForm.get(key).push(entry);
    }
  }
  const { byId, baseIdByKindId, kindsByBaseId } = buildKindOfLinks(words);
  const synonymIdsById = buildSynonymLinks(words, byId);
  const findAll = (form, excludeId, type) => (byForm.get(lookupKey(form)) || [])
    .filter((e) => e.id !== excludeId && (!type || e.type === type));
  return {
    findAll,
    find: (form, excludeId, type) => findAll(form, excludeId, type)[0],
    baseOf: (entry) => byId.get(baseIdByKindId.get(entry.id)) || null,
    kindsOf: (entry) => kindsByBaseId.get(entry.id) || [],
    synonymIdsOf: (entry) => synonymIdsById.get(entry.id) || new Set(),
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

// The answer is another entry. If this entry's synonymOf links to it, it is graded with that entry's own rules
// (a full answer counts as correct, with "Also right: …"); otherwise it is wrong and the note says what it means.
function gradeAsOtherWord(entry, raw, form, ctx, type) {
  if (!ctx.lookup || ctx.isNestedLookup) return null;
  const others = ctx.lookup.findAll(form, entry.id, type);
  if (!others.length) return null;
  const synonymIds = ctx.lookup.synonymIdsOf(entry);
  for (const other of others.filter((o) => synonymIds.has(o.id))) {
    const otherGrade = gradeEntry(other, raw, { ...ctx, isNestedLookup: true });
    if (otherGrade && otherGrade.result !== 'wrong') {
      return {
        result: otherGrade.result,
        notes: [`Also right: **${shortName(other)}** = ${other.en}. The word we were after: **${shortName(entry)}**.`, ...otherGrade.notes],
      };
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

function nounCandidates(entry) {
  const main = {
    article: entry.article, word: normalizeText(entry.fr), wordDisplay: entry.fr, gender: entry.gender,
    requireGender: entry.article === "l'" || (entry.article === 'les' && Boolean(entry.pluralOnly)),
    display: nounDisplay(entry.article, entry.fr, entry.gender),
  };
  const alternatives = (entry.alt || []).map((altText) => {
    const parsed = parseNounAnswer(normalizeText(altText));
    const article = parsed.article === 'le/la' ? 'le' : parsed.article ?? '';
    return {
      article, word: parsed.word, wordDisplay: parsed.word,
      gender: parsed.gender || ARTICLE_GENDER[parsed.article] || entry.gender,
      requireGender: article === "l'", display: altText,
    };
  });
  const candidates = [main, ...alternatives];
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
  // "les escargots" on the l'escargot card is the plural of this word, even when the plural is also its own entry
  const answerIsPluralOfWord = candidate.article !== 'les' && [candidate.word + 's', candidate.word + 'x'].includes(answer.word);
  let wordResult;
  if (cmp.kind === 'exact') wordResult = 'correct';
  else if (candidate.article === 'les' && [answer.word + 's', answer.word + 'x'].includes(candidate.word)) {
    pluralIssue = true;
    wordResult = 'partial';
  } else if (answerIsPluralOfWord) {
    wordResult = 'partial';
    notes.push(`Give the singular: **${candidate.display}**.`);
  } else if (cmp.kind === 'different') return { result: 'wrong', notes, different: true };
  else wordResult = 'partial';
  if (!pluralIssue && !answerIsPluralOfWord) notes.push(...comparisonNotes(cmp));
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
  return { result: worstResult(wordResult, articleResult), notes, close: cmp.kind === 'close' && !pluralIssue && !answerIsPluralOfWord, wordExact };
}

function bestGrade(grades) {
  return grades.reduce((best, g) => (RESULT_RANK[g.result] > RESULT_RANK[best.result] || (best.different && !g.different) ? g : best));
}

// Grade against the form the learner actually wrote: for ami / amie, "l'amie (m)" is a gender
// mistake on amie, not a misspelling of ami.
function bestNounGrade(grades) {
  const exactWordGrades = grades.filter((g) => g.wordExact);
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
  return { result: worstResult(...grades.map((g) => g.result)), notes: unique(grades.flatMap((g) => g.notes)) };
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
    if (otherVerb && cmp.kind !== 'accent') return gradeAsOtherWord(entry, raw, infinitive, ctx, 'verb');
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

function gradeFillIn(entry, fillIn, raw, ctx) {
  let text = withoutTrailingPunctuation(normalizeText(raw));
  const expected = normalizeText(fillIn.answer);
  if (entry.type === 'noun' || entry.type === 'country') {
    const withoutArticle = text.replace(/^(le|la|les|l')\s*/, '');
    if (withoutArticle === expected) text = withoutArticle;
  }
  const isConjugatedVerbBlank = entry.type === 'verb' && Number.isInteger(fillIn.formIndex);
  // A conjugated verb blank also accepts the other spellings of that person (conjAlt), e.g. paie / paye.
  const acceptedAnswers = isConjugatedVerbBlank
    ? unique([expected, ...acceptedVerbForms(entry, fillIn.formIndex).map((f) => normalizeText(f).replace(/^j'/, ''))])
    : [expected];
  const cmp = bestComparison(acceptedAnswers.map((answer) => compareText(text, answer, answer === expected ? fillIn.answer : answer)));
  if (cmp.kind === 'exact') return { result: 'correct', notes: comparisonNotes(cmp) };
  const accentPairGrade = cmp.kind === 'accent' && gradeAsAccentPairWord(text, expected);
  if (accentPairGrade) return accentPairGrade;
  const rule = isConjugatedVerbBlank ? verbRuleNote(entry, [fillIn.formIndex]) : null;

  // Another form of the same word: right verb in the wrong person, adjective without agreement, singular/plural
  if (entry.type === 'verb') {
    const stripJ = (f) => normalizeText(f).replace(/^j'/, '');
    const formsByPosition = [[entry.infinitive], ...entry.conj.map((_, i) => acceptedVerbForms(entry, i))];
    const index = formsByPosition.findIndex((group) => group.map(stripJ).includes(stripJ(text)));
    if (index >= 0) {
      const which = index === 0 ? 'the infinitive' : `the **${PRONOUNS[index - 1]}** form`;
      return { result: 'partial', notes: [`That's ${which} of ${entry.infinitive}. Here you need **${fillIn.answer}**.`, rule].filter(Boolean) };
    }
  }
  if (entry.type === 'adjective') {
    const forms = [entry.masc, entry.fem, entry.masc && `${entry.masc}s`, `${entry.fem}s`].filter(Boolean).map(normalizeText);
    if (forms.includes(text)) {
      const femNote = entry.masc && entry.masc !== entry.fem ? ` Feminine: ${feminineRule(entry.masc, entry.fem)}` : '';
      return { result: 'partial', notes: [`Right word, but it must agree with the noun here: **${fillIn.answer}**.${femNote}`] };
    }
  }
  if ((entry.type === 'noun' || entry.type === 'country') && (`${text}s` === expected || text === `${expected}s` || `${text}x` === expected)) {
    return { result: 'partial', notes: [`Right word — but here it's **${fillIn.answer}** (singular / plural).`] };
  }
  if (cmp.kind !== 'different') return { result: 'partial', notes: [...comparisonNotes(cmp), rule].filter(Boolean) };
  return gradeAsOtherWord(entry, raw, text, ctx, entry.type === 'verb' ? 'verb' : undefined) || { result: 'wrong', notes: [rule].filter(Boolean) };
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
