// Validates vocab.json. Run: node scripts/validate.js  (exit code 1 on errors)
import fs from 'node:fs';
import { SEED } from '../js/seed-progress.js';
import { buildFillIn } from '../js/selection.js';

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
const RULES = ['-ger', '-cer', 'é→è', 'double-l', '-ir-iss', '-re', 'irregular'];
const COMMON_FIELDS = ['id', 'type', 'en', 'theme', 'alt', 'example', 'tip', 'confusables'];
const FIELDS_BY_TYPE = {
  noun: ['fr', 'gender', 'article', 'pluralOnly'],
  country: ['fr', 'gender', 'article', 'pluralOnly', 'inTo'],
  adjective: ['masc', 'fem'],
  verb: ['infinitive', 'conj', 'rule'],
  expression: ['fr'],
  number: ['fr'],
};
const isText = (v) => typeof v === 'string' && v.trim().length > 0;

if (!Number.isInteger(vocab.version) || vocab.version < 1) errors.push('"version" must be a positive integer');
if (!Array.isArray(vocab.words)) {
  console.error('"words" must be an array');
  process.exit(1);
}

const ids = new Set();
for (const [index, w] of vocab.words.entries()) {
  const where = `words[${index}] ${w.id || '(no id)'}`;
  const fail = (message) => errors.push(`${where}: ${message}`);

  if (!isText(w.id) || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(w.id)) fail('id must be lowercase letters, digits and dashes');
  else if (ids.has(w.id)) fail('duplicate id');
  else ids.add(w.id);
  if (!TYPES.includes(w.type)) { fail(`type must be one of ${TYPES.join(', ')}`); continue; }
  if (!isText(w.en)) fail('missing "en"');
  if (!isText(w.theme)) fail('missing "theme"');

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
    if (w.rule !== undefined && !RULES.includes(w.rule)) fail(`rule must be one of ${RULES.join(', ')}`);
  }
  if ((w.type === 'expression' || w.type === 'number') && !isText(w.fr)) fail('missing "fr"');

  if (w.alt !== undefined && (!Array.isArray(w.alt) || !w.alt.every(isText))) fail('"alt" must be a list of strings');
  if (w.example !== undefined) {
    if (!isText(w.example?.fr)) fail('"example.fr" missing');
    if (w.example?.en !== undefined && typeof w.example.en !== 'string') fail('"example.en" must be text');
  }
  if (w.tip !== undefined && !isText(w.tip)) fail('"tip" must be text');
  if (w.confusables !== undefined && (!Array.isArray(w.confusables) || !w.confusables.every(isText))) fail('"confusables" must be a list of strings');
  if (w.type !== 'number' && !w.example) warnings.push(`${where}: no example sentence`);
}

for (const w of vocab.words) {
  for (const c of w.confusables || []) {
    if (/^(n|v|adj|x|c|nat|num)-/.test(c) && !ids.has(c)) errors.push(`${w.id}: confusable "${c}" is not an id in vocab.json`);
  }
}
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
