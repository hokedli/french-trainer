// Checks the grading rules against real mistakes. Run: node scripts/test-grading.js
import fs from 'node:fs';
import { gradeItem, buildLookup } from '../js/grading.js';
import { buildFillIn } from '../js/selection.js';

const { words } = JSON.parse(fs.readFileSync(new URL('../vocab.json', import.meta.url), 'utf8'));
const byId = new Map(words.map((w) => [w.id, w]));
const ctx = { lookup: buildLookup(words) };
let failures = 0;

function check(id, answer, expectedResult, expectedNoteFragment, fillIn = false) {
  const entry = byId.get(id);
  const item = fillIn ? { entry, fillIn: buildFillIn(entry) } : { entry };
  const graded = gradeItem(item, answer, ctx);
  const notes = graded.notes.join(' | ');
  const ok = graded.result === expectedResult && (!expectedNoteFragment || notes.includes(expectedNoteFragment));
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${id} "${answer.replace(/\n/g, '⏎')}" → ${graded.result}${ok ? '' : ` (expected ${expectedResult}${expectedNoteFragment ? ` + "${expectedNoteFragment}"` : ''})`}\n    ${notes}`);
}

// Nouns
check('n-quartier', 'le quartier', 'correct');
check('n-quartier', 'la quartier', 'wrong', '-ier are usually masculine');
check('n-quartier', 'le quartié', 'partial', 'Gender right ✓');
check('n-anniversaire', 'le anniversaire', 'partial', "become **l'**");
check('n-hopital', "l'hôpital (m)", 'correct');
check('n-hopital', "L’hôpital m.", 'correct');
check('n-hopital', "l'hopital masc", 'partial', 'Accent');
check('n-hopital', "l'hôpital", 'partial', 'add it');
check('n-prenom', 'le prenom', 'partial', 'é, not e');
check('n-impermeable', "l'impèrmiable (m)", 'partial', 'Almost');
check('n-lunettes', 'les lunettes (f)', 'correct');
check('n-lunettes', 'la lunette', 'partial', 'always plural');
check('n-soeur', 'la soeur', 'correct', 'œ');
check('n-equitation', "l'équitation (m)", 'wrong', '-tion / -sion are usually feminine');
check('n-image', "l'image (m)", 'wrong', 'exception');
check('n-collegue', 'la collègue', 'correct');
check('n-voisin', 'le voisin / la voisine', 'correct');
check('n-mer', 'la mère', 'wrong', 'mother');
check('n-lecon', 'le cours', 'correct', 'Also right');
check('n-pluie', '?', 'wrong');
check('n-pluie', '', 'wrong');
check('c-hongrie', 'la Hongrie', 'correct');
// Adjectives
check('adj-bruyant', 'bruyant / bruyante', 'correct');
check('adj-bruyant', 'bruyant, bruyante', 'correct');
check('adj-bruyant', 'bruyant - bruyante', 'correct');
check('adj-bruyant', 'bruyant / bruyant', 'partial', 'add -e');
check('adj-ennuyeux', 'ennuyeux / ennuyeuxe', 'partial', '-eux → -euse');
check('adj-ennuyeux', 'bruyant / bruyante', 'wrong', 'You wrote **bruyant** = noisy');
check('adj-sale', 'sale', 'correct');
check('adj-sale', 'sale / sale', 'correct');
check('nat-italien', 'italien / italiene', 'partial', '-ien → -ienne');
// Verbs
check('v-manger', 'manger, mange, manges, mange, mangons, mangez, mangent', 'partial', 'Only **nous**');
check('v-manger', 'manger, mange, manges, mange, mangons, mangez, mangent', 'partial', 'keep the **e** before -ons');
check('v-manger', 'manger\nje mange\ntu manges\nil/elle/on mange\nnous mangeons\nvous mangez\nils/elles mangent', 'correct');
check('v-manger', 'manger - mange; manges; mange; mangeons; mangez; mangent', 'correct');
check('v-commencer', 'commencer, commence, commences, commence, commencons, commencez, commencent', 'partial', '**ç**');
check('v-epeler', "épeler, j'épele, épeles, épele, épelons, épelez, épelent", 'partial', 'Double **l**');
check('v-preferer', 'préférer, préfére, préféres, préfére, préférons, préférez, préférent', 'partial', 'é → è');
check('v-choisir', 'choiser, choise, choises, choise, choisons, choisez, choisent', 'wrong', "isn't a French verb");
check('v-coudre', 'couturer, couture, coutures, couture, couturons, couturez, couturent', 'wrong', 'irregular');
check('v-choisir', 'choisir, choisis, choisis, choisit, choisons, choisez, choisent', 'wrong', 'iss');
check('v-apprendre', "étudier, j'étudie, étudies, étudie, étudions, étudiez, étudient", 'wrong', 'You wrote **étudier** = to study');
check('v-se-presenter', 'se présenter, je me présente, tu te présentes, il se présente, nous nous présentons, vous vous présentez, ils se présentent', 'correct');
check('v-s-appeler', "s'appeler, m'appelle, t'appelles, s'appelle, appelons, appelez, s'appellent", 'partial');
check('v-aimer', "aimer, aime, aimes, aime, aimons, aimez, aiment", 'correct');
check('v-payer', 'payer, paie, paies, paie, payons, payez, paient', 'correct');
check('v-payer', 'payer, paye, payes, paye, payons, payez, payent', 'correct');
check('v-payer', 'payer, paye, paies, paie, payons, payez, payent', 'correct');
check('v-payer', 'payer, paie, paies, paie, paions, payez, paient', 'partial', 'y → i');
// Expressions & numbers
check('x-bonjour', 'bonjour', 'correct');
check('x-ca-va', 'ca va?', 'partial', 'Accent');
check('x-ne-jamais', 'ne ... jamais', 'correct');
check('num-21', 'vingt-et-un', 'correct');
check('num-80', 'quatre-vingt', 'partial', 'Almost');
// Fill-ins
check('adj-bruyant', 'bruyante', 'correct', '', true);
check('adj-bruyant', 'bruyant', 'partial', 'agree', true);
check('v-manger', 'manges', 'correct', '', true);
check('v-payer', 'paie', 'correct', '', true);
check('v-payer', 'paye', 'correct', '', true);
check('v-payer', 'payons', 'partial', 'nous', true);

// kindOf: base word answered correctly lists its kinds
check('n-sac', 'le sac', 'correct', 'Also: **le sac à dos** (backpack, rucksack) · **le sac de sport** (sports bag) · **le sac à main** (handbag) · **le sac à ordinateur** (laptop bag)');
check('n-sac', 'la sac', 'wrong');
expectNoNoteContaining('n-sac', 'la sac', 'Also:');
check('adj-bleu', 'bleu / bleue', 'correct', '**bleu foncé** (dark blue)');
// kindOf: wrong answer that is another entry
check('n-bouteille-en-plastique', 'la bouteille', 'wrong', 'Almost: **la bouteille** (bottle) is the general word; this one is more specific.');
check('adj-bleu-fonce', 'bleu / bleue', 'wrong', 'Almost: **bleu** (blue) is the general word');
check('n-sac-a-dos', 'le sac à main', 'wrong', "That's another kind of **sac**: **le sac à main** = handbag.");
check('n-marchand', 'le vendeur', 'wrong', 'You wrote **le vendeur** = salesperson, shop assistant.');
check('n-pomme-de-terre', 'la pomme', 'wrong', 'You wrote **la pomme** = apple.');
check('n-pomme', 'la banane', 'wrong', 'You wrote **la banane** = banana. | You wrote **la banane** = bum bag, fanny pack.');
// No kindOf and no kinds: notes as before
check('n-quartier', 'le quartier', 'correct');
expectNoNoteContaining('n-quartier', 'le quartier', '');
check('n-mer', 'la mère', 'wrong', 'You wrote **la mère** = mother.');

function expectNoNoteContaining(id, answer, fragment) {
  const notes = gradeItem({ entry: byId.get(id) }, answer, ctx).notes;
  const ok = fragment ? !notes.some((n) => n.includes(fragment)) : notes.length === 0;
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${id} "${answer}" → ${fragment ? `no note with "${fragment}"` : 'no notes'}${ok ? '' : ` (got: ${notes.join(' | ')})`}`);
}

// Invalid kindOf links: warning, link ignored, no crash
{
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (message) => warnings.push(message);
  const testWords = [
    { id: 'n-base', type: 'noun', en: 'base', fr: 'base', gender: 'f', article: 'la' },
    { id: 'n-unknown-base', type: 'noun', en: 'x', fr: 'x', gender: 'm', article: 'le', kindOf: 'n-does-not-exist' },
    { id: 'n-self', type: 'noun', en: 'y', fr: 'y', gender: 'm', article: 'le', kindOf: 'n-self' },
    { id: 'n-chained', type: 'noun', en: 'z', fr: 'z', gender: 'm', article: 'le', kindOf: 'n-unknown-base' },
    { id: 'n-good-kind', type: 'noun', en: 'good kind', fr: 'base bonne', gender: 'f', article: 'la', kindOf: 'n-base' },
  ];
  let testLookup;
  try { testLookup = buildLookup(testWords); } finally { console.warn = originalWarn; }
  const byTestId = new Map(testWords.map((w) => [w.id, w]));
  const results = [
    ['3 warnings logged', warnings.length === 3 && ['n-unknown-base', 'n-self', 'n-chained'].every((id) => warnings.some((w) => w.includes(id)))],
    ['unknown base ignored', testLookup.baseOf(byTestId.get('n-unknown-base')) === null],
    ['self link ignored', testLookup.baseOf(byTestId.get('n-self')) === null && testLookup.kindsOf(byTestId.get('n-self')).length === 0],
    ['chained link ignored', testLookup.baseOf(byTestId.get('n-chained')) === null && testLookup.kindsOf(byTestId.get('n-unknown-base')).length === 0],
    ['valid link kept', testLookup.kindsOf(byTestId.get('n-base')).map((k) => k.id).join() === 'n-good-kind'],
    ['grading still works', gradeItem({ entry: byTestId.get('n-unknown-base') }, 'le x', { lookup: testLookup }).notes.length === 0],
  ];
  for (const [name, ok] of results) {
    if (!ok) failures++;
    console.log(`${ok ? '✓' : '✗'} invalid kindOf: ${name}`);
  }
  if (!results[0][1]) console.log(`    warnings: ${warnings.join(' | ')}`);
}

const fill = buildFillIn(byId.get('adj-bruyant'));
console.log(`\nFill-in sample: ${fill.sentence} (${fill.hint}) — ${fill.translation} → ${fill.answer}`);
console.log(failures ? `\n✗ ${failures} check(s) failed` : '\n✓ all checks passed');
process.exit(failures ? 1 : 0);
