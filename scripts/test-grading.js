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
check('adj-ennuyeux', 'bruyant / bruyante', 'wrong', "That's **bruyant**");
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
check('v-apprendre', "étudier, j'étudie, étudies, étudie, étudions, étudiez, étudient", 'wrong', "That's **étudier** = to study. To learn is **apprendre**");
check('v-se-presenter', 'se présenter, je me présente, tu te présentes, il se présente, nous nous présentons, vous vous présentez, ils se présentent', 'correct');
check('v-s-appeler', "s'appeler, m'appelle, t'appelles, s'appelle, appelons, appelez, s'appellent", 'partial');
check('v-aimer', "aimer, aime, aimes, aime, aimons, aimez, aiment", 'correct');
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

const fill = buildFillIn(byId.get('adj-bruyant'));
console.log(`\nFill-in sample: ${fill.sentence} (${fill.hint}) — ${fill.translation} → ${fill.answer}`);
console.log(failures ? `\n✗ ${failures} check(s) failed` : '\n✓ all checks passed');
process.exit(failures ? 1 : 0);
