// Validates vocab.json. Run: node scripts/validate.js  (exit code 1 on errors)
import fs from 'node:fs';
import { SEED } from '../js/seed-progress.js';
import { buildFillIn } from '../js/selection.js';
import { lookupKey, ownForms, altForms, synonymLinkProblem, fillInForms, wordBeforeBlank, BLANK, buildLookup, gradeItem, frenchPlural } from '../js/grading.js';

const vocabPath = new URL('../vocab.json', import.meta.url);
const errors = [];
const warnings = [];

let vocab;
try {
  vocab = JSON.parse(fs.readFileSync(vocabPath, 'utf8'));
} catch (error) {
  console.error(`vocab.json is not valid JSON: ${error.message}`);
  process.exit(1);
}

const TYPES = ['noun', 'verb', 'adjective', 'expression', 'country', 'number'];
const RULES = ['-ger', '-cer', '-yer', 'é→è', 'e→è', 'double-l', '-ir-iss', '-re', 'irregular'];
const COMMON_FIELDS = ['id', 'type', 'en', 'themes', 'kindOf', 'acceptedSynonyms', 'alt', 'examples', 'tip', 'confusables'];
const FIELDS_BY_TYPE = {
  noun: ['fr', 'gender', 'article', 'pluralOnly'],
  country: ['fr', 'gender', 'article', 'pluralOnly', 'inTo'],
  adjective: ['masc', 'fem'],
  verb: ['infinitive', 'conj', 'conjAlt', 'rule'],
  expression: ['fr'],
  number: ['fr'],
};
const EXAMPLE_FIELDS = ['fr', 'en', 'eitherGender', 'anyWording'];
const GENDER_FLEXIBLE_TYPES = ['noun', 'country', 'adjective'];
// Right before the blank, these already show the gender, so an eitherGender flag there would accept a wrong agreement
const GENDERED_WORDS_BEFORE_BLANK = new Set(['le', 'la', 'un', 'une', 'ce', 'cet', 'cette', 'du', 'au', 'ma', 'ta', 'sa', 'quel', 'quelle']);
const GENDERED_SUBJECT_BEFORE_BLANK = /\b(il|elle|ils|elles)\s+(?:ne\s+|n')?(?:est|sont)(?:\s+pas)?\s*$/i;
const isText = (v) => typeof v === 'string' && v.trim().length > 0;

if (!Number.isInteger(vocab.version) || vocab.version < 1) errors.push('"version" must be a positive integer');
if (!Array.isArray(vocab.words)) {
  console.error('"words" must be an array');
  process.exit(1);
}
const MAX_THEMES_PER_WORD = 3;
const knownThemes = new Set(Array.isArray(vocab.themes) ? vocab.themes : []);
if (!Array.isArray(vocab.themes) || vocab.themes.length === 0 || !vocab.themes.every(isText)) errors.push('"themes" (top level) must be a list of theme names');
else if (knownThemes.size !== vocab.themes.length) errors.push('"themes" (top level) lists a theme twice');

const ids = new Set();
for (const [index, w] of vocab.words.entries()) {
  const where = `words[${index}] ${w.id || '(no id)'}`;
  const fail = (message) => errors.push(`${where}: ${message}`);

  if (!isText(w.id) || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(w.id)) fail('id must be lowercase letters, digits and dashes');
  else if (ids.has(w.id)) fail('duplicate id');
  else ids.add(w.id);
  if (!TYPES.includes(w.type)) { fail(`type must be one of ${TYPES.join(', ')}`); continue; }
  if (!isText(w.en)) fail('missing "en"');
  if (!Array.isArray(w.themes) || w.themes.length === 0 || w.themes.length > MAX_THEMES_PER_WORD || !w.themes.every(isText)) {
    fail(`"themes" must be a list of 1–${MAX_THEMES_PER_WORD} theme names`);
  } else {
    for (const theme of w.themes) if (!knownThemes.has(theme)) fail(`unknown theme "${theme}" (add it to the top-level "themes" list, or fix the spelling)`);
    if (new Set(w.themes).size !== w.themes.length) fail('"themes" lists a theme twice');
  }

  const allowed = new Set([...COMMON_FIELDS, ...FIELDS_BY_TYPE[w.type]]);
  for (const key of Object.keys(w)) if (!allowed.has(key)) fail(`unknown field "${key}" for type ${w.type}`);

  if (w.type === 'noun' || w.type === 'country') {
    if (!isText(w.fr)) fail('missing "fr"');
    if (!['m', 'f', 'mf'].includes(w.gender)) fail('gender must be m, f or mf');
    const articles = w.type === 'country' ? ['le', 'la', "l'", 'les', ''] : ['le', 'la', "l'", 'les'];
    if (!articles.includes(w.article)) fail(`article must be one of ${articles.map((a) => JSON.stringify(a)).join(', ')}`);
    if (w.article === 'le' && w.gender === 'f') fail('article "le" with gender f');
    if (w.article === 'la' && w.gender !== 'f') fail('article "la" needs gender f');
    if (w.article === "l'" && isText(w.fr) && !/^[aeiouyhâàäéèêëîïôöûùüœ]/i.test(w.fr)) fail("article l' but the word doesn't start with a vowel or h");
    if (w.article === 'les' && w.pluralOnly !== true) fail('article "les" needs "pluralOnly": true');
    if (w.pluralOnly !== undefined && typeof w.pluralOnly !== 'boolean') fail('pluralOnly must be true or false');
    if (w.inTo !== undefined && !isText(w.inTo)) fail('inTo must be text');
  }
  if (w.type === 'adjective') {
    if (!isText(w.fem)) fail('missing "fem"');
    if (w.masc !== null && !isText(w.masc)) fail('"masc" must be text (or null for feminine-only words)');
  }
  if (w.type === 'verb') {
    if (!isText(w.infinitive)) fail('missing "infinitive"');
    if (!Array.isArray(w.conj) || w.conj.length !== 6 || !w.conj.every(isText)) fail('"conj" must be 6 forms (je, tu, il, nous, vous, ils)');
    else if (w.conj.some((f) => /^(je|tu|il|elle|on|ils|elles) /.test(f))) fail('"conj" forms must not include the subject pronoun');
    if (w.conjAlt !== undefined) {
      if (!Array.isArray(w.conjAlt) || w.conjAlt.length !== 6 || !w.conjAlt.every(isText)) {
        fail('"conjAlt" must be a complete second conjugation: 6 forms (je, tu, il, nous, vous, ils), repeating the "conj" form where a person has no other spelling');
      } else if (Array.isArray(w.conj) && w.conjAlt.every((form, i) => form === w.conj[i])) fail('"conjAlt" is the same as "conj" — remove it');
      else if (w.conjAlt.some((f) => /^(je|tu|il|elle|on|ils|elles) /.test(f))) fail('"conjAlt" forms must not include the subject pronoun');
    }
    if (w.rule !== undefined && !RULES.includes(w.rule)) fail(`rule must be one of ${RULES.join(', ')}`);
  }
  if ((w.type === 'expression' || w.type === 'number') && !isText(w.fr)) fail('missing "fr"');

  if (w.alt !== undefined && (!Array.isArray(w.alt) || !w.alt.every(isText))) fail('"alt" must be a list of strings');
  if (w.examples !== undefined) {
    if (!Array.isArray(w.examples) || !w.examples.length) fail('"examples" must be a non-empty list (leave it out if there are none)');
    else w.examples.forEach((example, i) => {
      if (!isText(example?.fr)) fail(`"examples[${i}].fr" missing`);
      if (example?.en !== undefined && typeof example.en !== 'string') fail(`"examples[${i}].en" must be text`);
      if (example?.eitherGender !== undefined) {
        if (example.eitherGender !== true) fail(`"examples[${i}].eitherGender" must be true (leave it out otherwise)`);
        else if (!GENDER_FLEXIBLE_TYPES.includes(w.type)) fail(`"examples[${i}].eitherGender" only works for ${GENDER_FLEXIBLE_TYPES.join(', ')} entries`);
      }
      if (example?.anyWording !== undefined) {
        if (example.anyWording !== true) fail(`"examples[${i}].anyWording" must be true (leave it out otherwise)`);
        else if (w.type !== 'expression') fail(`"examples[${i}].anyWording" only works for expression entries`);
      }
      for (const key of Object.keys(example || {})) if (!EXAMPLE_FIELDS.includes(key)) fail(`unknown field "${key}" in examples[${i}]`);
    });
  }
  if (w.tip !== undefined && !isText(w.tip)) fail('"tip" must be text');
  if (w.confusables !== undefined && (!Array.isArray(w.confusables) || !w.confusables.every(isText))) fail('"confusables" must be a list of strings');
  if (w.acceptedSynonyms !== undefined) {
    if (!Array.isArray(w.acceptedSynonyms) || !w.acceptedSynonyms.length || !w.acceptedSynonyms.every(isText)) fail('"acceptedSynonyms" must be a non-empty list of ids');
    else if (new Set(w.acceptedSynonyms).size !== w.acceptedSynonyms.length) fail('"acceptedSynonyms" lists an id twice');
  }
  if (w.type !== 'number' && !w.examples) warnings.push(`${where}: no example sentence`);
}

const wordsById = new Map(vocab.words.map((w) => [w.id, w]));

// Other entries an alt refers to: "le professeur" in n-enseignant's alt is n-professeur's own word
const idsByOwnForm = new Map();
for (const w of vocab.words) {
  for (const form of ownForms(w)) {
    const key = lookupKey(form);
    if (!idsByOwnForm.has(key)) idsByOwnForm.set(key, new Set());
    idsByOwnForm.get(key).add(w.id);
  }
}
const altIdsOf = (w) => new Set(altForms(w).flatMap((form) => [...(idsByOwnForm.get(lookupKey(form)) || [])]).filter((id) => id !== w.id));

// id → the relations this entry has to it. An id may be only one of kindOf / acceptedSynonyms / confusables / alt per entry.
function relationsOf(w) {
  const relations = new Map();
  const add = (id, relation) => { if (!relations.has(id)) relations.set(id, new Set()); relations.get(id).add(relation); };
  if (w.kindOf !== undefined) add(w.kindOf, 'kindOf');
  for (const id of w.acceptedSynonyms || []) add(id, 'acceptedSynonyms');
  for (const id of w.confusables || []) if (wordsById.has(id)) add(id, 'confusables');
  for (const id of altIdsOf(w)) add(id, 'alt');
  return relations;
}
const relationsById = new Map(vocab.words.map((w) => [w.id, relationsOf(w)]));

for (const w of vocab.words) {
  for (const c of w.confusables || []) {
    if (/^(n|v|adj|x|c|nat|num)-/.test(c) && !ids.has(c)) errors.push(`${w.id}: confusable "${c}" is not an id in vocab.json`);
  }
  if (w.kindOf !== undefined) {
    const base = wordsById.get(w.kindOf);
    if (!base) errors.push(`${w.id}: kindOf "${w.kindOf}" is not an id in vocab.json`);
    else if (base.id === w.id) errors.push(`${w.id}: kindOf points to itself`);
    else if (base.kindOf !== undefined) errors.push(`${w.id}: kindOf "${w.kindOf}" has its own kindOf — the base word must not have one`);
  }
  for (const id of Array.isArray(w.acceptedSynonyms) ? w.acceptedSynonyms : []) {
    const problem = synonymLinkProblem(w, id, wordsById);
    if (problem) errors.push(`${w.id}: acceptedSynonyms "${id}" ${problem}`);
  }
  for (const [id, relations] of relationsById.get(w.id)) {
    if (relations.size > 1) errors.push(`${w.id}: "${id}" is in ${[...relations].join(' and ')} — an id can only be one of kindOf, acceptedSynonyms, confusables or alt`);
    // A confusable must not be an alt or a kindOf link of the other entry either. The link itself may be one-way
    // (n-voiture lists n-car because of the English "car", n-car doesn't list n-voiture), and the other entry may even
    // accept this one (n-chemisier accepts n-chemise, while n-chemise lists n-chemisier as a confusable).
    const reverse = relationsById.get(id)?.get(w.id);
    const reverseConflicts = [...(reverse || [])].filter((relation) => relation === 'kindOf' || relation === 'alt');
    if (relations.has('confusables') && reverseConflicts.length) {
      errors.push(`${w.id}: "${id}" is a confusable here, but ${id} has ${w.id} in ${reverseConflicts.join(' and ')}`);
    }
  }
}
const usedThemes = new Set(vocab.words.flatMap((w) => (Array.isArray(w.themes) ? w.themes : [])));
for (const theme of knownThemes) if (!usedThemes.has(theme)) warnings.push(`theme "${theme}" has no words`);
for (const id of Object.keys(SEED.boxes)) {
  if (!ids.has(id)) warnings.push(`seed-progress.js: "${id}" is not in vocab.json (its seed is ignored)`);
}

const printWarnings = () => { if (warnings.length && process.argv.includes('--verbose')) console.log(warnings.map((w) => `warning: ${w}`).join('\n')); };
if (errors.length) {
  printWarnings();
  console.error(errors.map((e) => `error: ${e}`).join('\n'));
  console.error(`\n✗ ${errors.length} error(s) in vocab.json`);
  process.exit(1);
}
// Only after the errors: building fill-ins from a broken entry (e.g. a malformed conjAlt) would crash first
const fillInCount = vocab.words.filter((w) => buildFillIn(w)).length;

// eitherGender / anyWording flags that do nothing, or that the sentence contradicts
for (const w of vocab.words) {
  for (const [i, example] of (w.examples || []).entries()) {
    if (example.anyWording === true) {
      const where = `${w.id} examples[${i}] (anyWording)`;
      if (!buildFillIn({ ...w, examples: [example] })) warnings.push(`${where}: never becomes a fill-in (it needs "en" and the expression in the sentence), so the flag does nothing`);
      else if (!w.alt?.length) warnings.push(`${where}: ${w.id} has no alt wordings, so the flag does nothing`);
    }
    if (example.eitherGender !== true) continue;
    const where = `${w.id} examples[${i}] (eitherGender)`;
    const fillIn = buildFillIn({ ...w, examples: [example] });
    if (!fillIn) { warnings.push(`${where}: never becomes a fill-in (it needs "en" and the word in the sentence), so the flag does nothing`); continue; }
    const synonyms = (w.acceptedSynonyms || []).map((id) => wordsById.get(id)).filter(Boolean);
    const blanked = fillIn.answer.toLowerCase();
    const sameNumber = (slot) => slot.plural == null || fillIn.slot.plural == null || slot.plural === fillIn.slot.plural;
    const hasOtherGender = [w, ...synonyms].flatMap(fillInForms)
      .some((f) => f.slot.gender !== 'mf' && f.slot.gender !== fillIn.slot.gender && f.form.toLowerCase() !== blanked && sameNumber(f.slot));
    if (!hasOtherGender) warnings.push(`${where}: "${fillIn.answer}" has no form of the other gender (in the entry, its alts or acceptedSynonyms), so the flag does nothing`);
    const textBefore = fillIn.sentence.slice(0, fillIn.sentence.indexOf(BLANK));
    if (GENDERED_WORDS_BEFORE_BLANK.has(wordBeforeBlank(fillIn.sentence)) || GENDERED_SUBJECT_BEFORE_BLANK.test(textBefore)) {
      warnings.push(`${where}: "${fillIn.sentence}" already shows the gender before the blank — remove the flag`);
    }
  }
}

// Fill-ins accept both +x and +s as the plural of an -au / -eu / -ou word (pluralForms in grading.js), so a plural
// blank grades the wrong one as correct (gâteaus, bijous). Such an example should have no "en".
// The spellings among +x / +s that aren't the real plural (frenchPlural). Several words: no real plural is known, and
// neither spelling ends up in a sentence (verres à eau), so there is nothing to check.
function wrongPluralsOf(form) {
  if (!/(au|eu|ou)$/i.test(form)) return [];
  const realPlural = frenchPlural(form);
  return realPlural ? [`${form}x`, `${form}s`].filter((plural) => plural.toLowerCase() !== realPlural) : [];
}
const lookup = buildLookup(vocab.words);
for (const w of vocab.words) {
  for (const [i, example] of (w.examples || []).entries()) {
    const fillIn = buildFillIn({ ...w, examples: [example] });
    if (!fillIn) continue;
    // The entry's own singular forms, its alts and its acceptedSynonyms (and the other gender, for adjectives)
    const singularForms = [w, ...lookup.synonymsOf(w)].flatMap(fillInForms).filter((f) => f.slot.plural === false).map((f) => f.form);
    const wrongPlurals = [...new Set(singularForms.flatMap(wrongPluralsOf))];
    const acceptedWrongPlurals = wrongPlurals.filter((answer) => gradeItem({ entry: w, fillIn, example }, answer, { lookup }).result === 'correct');
    if (acceptedWrongPlurals.length) {
      warnings.push(`${w.id} examples[${i}]: the fill-in "${fillIn.sentence}" accepts the wrong plural ${acceptedWrongPlurals.join(', ')} — remove "en" from this example`);
    }
  }
}
printWarnings();
const counts = {};
for (const w of vocab.words) counts[w.type] = (counts[w.type] || 0) + 1;
console.log(`✓ vocab.json v${vocab.version}: ${vocab.words.length} words (${Object.entries(counts).map(([t, n]) => `${n} ${t}`).join(', ')})`);
console.log(`  ${fillInCount} words can be used as sentence fill-ins; ${warnings.length} warning(s) (show with --verbose)`);
