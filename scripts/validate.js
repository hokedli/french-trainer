// Validates vocab.json. Run: node scripts/validate.js  (exit code 1 on errors)
import fs from 'node:fs';
import { SEED } from '../js/seed-progress.js';
import { buildFillIn } from '../js/selection.js';
import { lookupKey, ownForms, altForms, synonymLinkProblem } from '../js/grading.js';

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
const COMMON_FIELDS = ['id', 'type', 'en', 'themes', 'kindOf', 'synonymOf', 'alt', 'examples', 'tip', 'confusables'];
const FIELDS_BY_TYPE = {
  noun: ['fr', 'gender', 'article', 'pluralOnly'],
  country: ['fr', 'gender', 'article', 'pluralOnly', 'inTo'],
  adjective: ['masc', 'fem'],
  verb: ['infinitive', 'conj', 'conjAlt', 'rule'],
  expression: ['fr'],
  number: ['fr'],
};
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
      if (!Array.isArray(w.conjAlt) || w.conjAlt.length !== 6 || !w.conjAlt.every((forms) => Array.isArray(forms) && forms.every(isText))) {
        fail('"conjAlt" must be 6 lists of extra accepted forms (je, tu, il, nous, vous, ils); use [] for persons without one');
      } else if (w.conjAlt.every((forms) => forms.length === 0)) fail('"conjAlt" has no forms — remove it');
      else if (Array.isArray(w.conj) && w.conjAlt.some((forms, i) => forms.includes(w.conj[i]))) fail('"conjAlt" repeats a form that is already in "conj"');
      else if (w.conjAlt.flat().some((f) => /^(je|tu|il|elle|on|ils|elles) /.test(f))) fail('"conjAlt" forms must not include the subject pronoun');
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
      for (const key of Object.keys(example || {})) if (key !== 'fr' && key !== 'en') fail(`unknown field "${key}" in examples[${i}]`);
    });
  }
  if (w.tip !== undefined && !isText(w.tip)) fail('"tip" must be text');
  if (w.confusables !== undefined && (!Array.isArray(w.confusables) || !w.confusables.every(isText))) fail('"confusables" must be a list of strings');
  if (w.synonymOf !== undefined) {
    if (!Array.isArray(w.synonymOf) || !w.synonymOf.length || !w.synonymOf.every(isText)) fail('"synonymOf" must be a non-empty list of ids');
    else if (new Set(w.synonymOf).size !== w.synonymOf.length) fail('"synonymOf" lists an id twice');
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

// id → the relations this entry has to it. An id may be only one of kindOf / synonymOf / confusables / alt per entry.
function relationsOf(w) {
  const relations = new Map();
  const add = (id, relation) => { if (!relations.has(id)) relations.set(id, new Set()); relations.get(id).add(relation); };
  if (w.kindOf !== undefined) add(w.kindOf, 'kindOf');
  for (const id of w.synonymOf || []) add(id, 'synonymOf');
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
  for (const id of Array.isArray(w.synonymOf) ? w.synonymOf : []) {
    const problem = synonymLinkProblem(w, id, wordsById);
    if (problem) errors.push(`${w.id}: synonymOf "${id}" ${problem}`);
  }
  for (const [id, relations] of relationsById.get(w.id)) {
    if (relations.size > 1) errors.push(`${w.id}: "${id}" is in ${[...relations].join(' and ')} — an id can only be one of kindOf, synonymOf, confusables or alt`);
    // Confusables are never accepted, so the other entry must not accept this one or link it by kindOf either.
    // The link itself may be one-way (n-voiture lists n-car because of the English "car", n-car doesn't list n-voiture).
    const reverse = relationsById.get(id)?.get(w.id);
    if (relations.has('confusables') && reverse && !reverse.has('confusables')) {
      errors.push(`${w.id}: "${id}" is a confusable here, but ${id} has ${w.id} in ${[...reverse].join(' and ')}`);
    }
  }
}
const usedThemes = new Set(vocab.words.flatMap((w) => (Array.isArray(w.themes) ? w.themes : [])));
for (const theme of knownThemes) if (!usedThemes.has(theme)) warnings.push(`theme "${theme}" has no words`);
for (const id of Object.keys(SEED.boxes)) {
  if (!ids.has(id)) warnings.push(`seed-progress.js: "${id}" is not in vocab.json (its seed is ignored)`);
}

const fillInCount = vocab.words.filter((w) => buildFillIn(w)).length;
if (warnings.length && process.argv.includes('--verbose')) console.log(warnings.map((w) => `warning: ${w}`).join('\n'));
if (errors.length) {
  console.error(errors.map((e) => `error: ${e}`).join('\n'));
  console.error(`\n✗ ${errors.length} error(s) in vocab.json`);
  process.exit(1);
}
const counts = {};
for (const w of vocab.words) counts[w.type] = (counts[w.type] || 0) + 1;
console.log(`✓ vocab.json v${vocab.version}: ${vocab.words.length} words (${Object.entries(counts).map(([t, n]) => `${n} ${t}`).join(', ')})`);
console.log(`  ${fillInCount} words can be used as sentence fill-ins; ${warnings.length} warning(s) (show with --verbose)`);
