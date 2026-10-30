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
      return `${entry.infinitive}: ${entry.conj.map(withPronoun).join(', ')}`;
    default:
      return [entry.fr, ...alt].join(' / ');
  }
}

// ---------- lookup of other vocab words ----------

const lookupKey = (s) => stripAccents(expandLigatures(withoutPunctuation(normalizeText(s))));

function formsForLookup(entry) {
  const altWords = (entry.alt || []).map((a) => parseNounAnswer(normalizeText(a)).word);
  switch (entry.type) {
    case 'noun':
    case 'country':
      return [entry.fr, ...altWords];
    case 'adjective':
      return [entry.masc, entry.fem, ...(entry.alt || []).flatMap((a) => a.split('/'))];
    case 'verb':
      return [entry.infinitive];
    default:
      return [entry.fr, ...(entry.alt || [])];
  }
}

export function buildLookup(words) {
  const byForm = new Map();
  for (const entry of words) {
    for (const form of formsForLookup(entry)) {
      if (!form) continue;
      const key = lookupKey(form);
      if (!byForm.has(key)) byForm.set(key, []);
      byForm.get(key).push(entry);
    }
  }
  return {
    find(form, excludeId, type) {
      const matches = byForm.get(lookupKey(form)) || [];
      return matches.find((e) => e.id !== excludeId && (!type || e.type === type));
    },
  };
}

// Splits "a, b / c (d, e)" at top level only: ["a", "b", "c (d, e)"]
function meanings(en) {
  const result = [];
  let depth = 0;
  let current = '';
  for (const ch of en.toLowerCase()) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (depth === 0 && /[,;/]/.test(ch)) { result.push(current); current = ''; } else current += ch;
  }
  result.push(current);
  return result.map((m) => m.replace(/[?!.]+$/, '').trim()).filter(Boolean);
}

// Same type and the other word's meaning matches one of the prompt's meanings
function isSynonym(promptEntry, otherEntry) {
  if (promptEntry.type !== otherEntry.type) return false;
  const promptMeanings = new Set(meanings(promptEntry.en));
  return meanings(otherEntry.en).some((m) => promptMeanings.has(m.replace(/\s*\(.*?\)\s*/g, ' ').trim()));
}

function gradeAsOtherWord(entry, raw, form, ctx, type) {
  if (!ctx.lookup || ctx.isNestedLookup) return null;
  const other = ctx.lookup.find(form, entry.id, type);
  if (!other) return null;
  if (isSynonym(entry, other)) {
    const otherGrade = gradeEntry(other, raw, { ...ctx, isNestedLookup: true });
    if (otherGrade.result !== 'wrong') {
      return {
        result: otherGrade.result,
        notes: [`Also right: **${shortName(other)}** = ${other.en}. The word we were after: **${shortName(entry)}**.`, ...otherGrade.notes],
      };
    }
  }
  return {
    result: 'wrong',
    notes: [`That's **${shortName(other)}** = ${other.en}. ${capitalize(entry.en)} is **${shortName(entry)}**.`],
  };
}

// ---------- nouns & countries ----------

const ARTICLE_GENDER = { le: 'm', la: 'f', un: 'm', une: 'f', 'le/la': 'mf' };
const GENDER_WORDS = {
  m: 'm', masc: 'm', masculin: 'm', masculine: 'm',
  f: 'f', fem: 'f', 'fém': 'f', feminin: 'f', 'féminin': 'f', feminine: 'f', 'féminine': 'f',
  'm/f': 'mf', 'f/m': 'mf',
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
  const genderMatch = rest.match(/(?:^|\s|\()\(?\s*(m\/f|f\/m|masculine|masculin|masc|m|féminine|feminine|féminin|feminin|fém|fem|f)\s*\.?\s*\)?$/);
  if (genderMatch) {
    gender = GENDER_WORDS[genderMatch[1]];
    rest = rest.slice(0, genderMatch.index).trim();
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
  return [main, ...alternatives];
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
  let wordResult;
  if (cmp.kind === 'exact') wordResult = 'correct';
  else if (candidate.article === 'les' && [answer.word + 's', answer.word + 'x'].includes(candidate.word)) {
    pluralIssue = true;
    wordResult = 'partial';
  } else if (cmp.kind === 'different') return { result: 'wrong', notes, different: true };
  else wordResult = 'partial';
  if (!pluralIssue) notes.push(...comparisonNotes(cmp));

  const givenGender = answer.gender || ARTICLE_GENDER[answer.article] || null;
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
  return { result: worstResult(wordResult, articleResult), notes, close: cmp.kind === 'close' && !pluralIssue };
}

function bestGrade(grades) {
  return grades.reduce((best, g) => (RESULT_RANK[g.result] > RESULT_RANK[best.result] || (best.different && !g.different) ? g : best));
}

function gradeNoun(entry, raw, ctx) {
  const text = normalizeText(raw);
  const parts = /^le\s*\/\s*la\s/.test(text) ? [text] : text.split(/\s*\/\s*(?=le\s|la\s|les\s|l')/).filter(Boolean);
  const candidates = nounCandidates(entry);
  const grades = parts.map((part) => bestGrade(candidates.map((c) => gradeNounAgainst(parseNounAnswer(part), c))));
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

function gradeAdjective(entry, raw, ctx) {
  const forms = splitAdjectiveForms(normalizeText(raw), entry);
  const candidates = [
    { masc: entry.masc && normalizeText(entry.masc), fem: normalizeText(entry.fem) },
    ...(entry.alt || []).map((a) => { const [m, f] = a.split('/').map(normalizeText); return { masc: m, fem: f || m }; }),
  ];
  const grade = bestGrade(candidates.map((c) => gradeAdjectiveAgainst(forms, c)));
  if (grade.different) return gradeAsOtherWord(entry, raw, forms[0] || '', ctx) || { result: 'wrong', notes: [] };
  if (grade.result !== 'correct' && forms.length) {
    const otherEntry = ctx.lookup?.find(forms[0], entry.id, 'adjective');
    if (otherEntry && compareText(forms[0], normalizeText(entry.masc || entry.fem)).kind === 'close') {
      return gradeAsOtherWord(entry, raw, forms[0], ctx);
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

function compareVerbForm(userForm, expectedForm) {
  const userOptions = unique([userForm, userForm.replace(SUBJECT_PRONOUN, ''), userForm.replace(/^j'/, '')]);
  const expectedOptions = unique([expectedForm, expectedForm.replace(/^j'/, '')]);
  return bestComparison(userOptions.flatMap((u) => expectedOptions.map((e) => compareText(u, e, expectedForm))));
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

  const comparisons = entry.conj.map((expected, i) => (forms[i] === undefined ? { kind: 'missing' } : compareVerbForm(forms[i], normalizeText(expected))));
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
  const cmp = compareText(text, expected, fillIn.answer);
  if (cmp.kind === 'exact') return { result: 'correct', notes: comparisonNotes(cmp) };
  const rule = entry.type === 'verb' && Number.isInteger(fillIn.formIndex) ? verbRuleNote(entry, [fillIn.formIndex]) : null;

  // Another form of the same word: right verb in the wrong person, adjective without agreement, singular/plural
  if (entry.type === 'verb') {
    const otherForms = [entry.infinitive, ...entry.conj].map((f) => normalizeText(f).replace(/^j'/, ''));
    const index = otherForms.indexOf(text.replace(/^j'/, ''));
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
  return { result: grade.result, correctAnswer, notes: unique(notes), showExample: grade.result !== 'correct' };
}
