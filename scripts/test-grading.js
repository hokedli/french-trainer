// Checks the grading rules against real mistakes. Run: node scripts/test-grading.js
import fs from 'node:fs';
import { gradeItem, buildLookup } from '../js/grading.js';
import { buildFillIn, buildItems } from '../js/selection.js';

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
// masculin / féminin as the noun itself, not a gender marker
check('n-masculin', 'le masculin', 'correct');
check('n-masculin', 'masculin', 'partial', 'article');
check('n-masculin', 'le masculin (m)', 'correct');
check('n-feminin', 'le féminin', 'correct');
check('n-feminin', 'le feminin', 'partial', 'Accent');
check('n-feminin', 'le masculin', 'wrong', '**le masculin** = the masculine');
// mf / fm mean the same as m/f
check('n-hopital', "l'hôpital (mf)", 'wrong', 'masculine');
check('n-hopital', "l'hôpital m/f", 'wrong', 'masculine');
check('n-artiste', "l'artiste (mf)", 'correct');
check('n-artiste', "l'artiste fm", 'correct');
// article and gender marker must agree
check('n-conducteur', 'le conductrice (f)', 'wrong', 'but you marked it (f)');
check('n-conducteur', 'la conducteur (m)', 'wrong', 'but you marked it (m)');
check('n-quartier', 'la quartier (m)', 'wrong', 'but you marked it (m)');
check('n-conducteur', 'la conductrice (f)', 'correct');
check('n-dentiste', 'la dentiste (m/f)', 'correct');
check('n-dentiste', 'le dentiste (f)', 'wrong', 'but you marked it (f): **le dentiste / la dentiste**.');
check('n-dentiste', 'la dentiste (m)', 'wrong', 'but you marked it (m): **le dentiste / la dentiste**.');
check('n-conducteur', 'le conductrice', 'wrong', '**conductrice** is feminine');
// m/f pairs: a form with the other form's gender is a gender mistake, not a misspelling
check('n-ami', "l'amie (m)", 'wrong', '**amie** is feminine');
check('n-ami', "l'ami (f)", 'wrong', '**ami** is masculine');
check('n-ami', 'le amie', 'wrong', '**amie** is feminine');
check('n-ami', "l'ammi (m)", 'partial', 'Almost');
// adjectives: bracketed gender markers are ignored
check('nat-tcheque', 'tchèque (m/f)', 'correct');
check('nat-tcheque', 'tchèque (f/m)', 'correct');
check('nat-tcheque', 'tchèque (mf)', 'correct');
check('nat-serbe', 'serbe (m) / serbe (f)', 'correct');
check('adj-grand', 'grand (m) / grande (f)', 'correct');
check('adj-grand', 'grande (f), grand (m)', 'correct', 'masculine first');
check('adj-grand', 'grand (m)', 'partial', 'Give both forms');
check('adj-masculin', 'masculin / masculine', 'correct');
// géniale on the grand card must not crash; the entry's own feminine is not a near-spelling of another word
check('adj-grand', 'géniale', 'wrong', '**génial** = brilliant');
check('adj-genial', 'géniale', 'partial', 'Give both forms');
// acceptedSynonyms: only explicit links are accepted, graded with the synonym's own rules
check('adj-grand', 'super', 'wrong', '**super** = super, really good, great.');
check('adj-genial', 'super', 'correct', 'Also right: **super**');
check('adj-super', 'génial / géniale', 'correct', 'Also right: **génial**');
check('adj-super', 'génial', 'partial', 'Give both forms');
check('adj-calme', 'tranquille', 'correct', 'Also right');
check('n-enseignant', 'le prof', 'correct', 'Also right: **le prof**');
check('n-enseignant', 'la professeure', 'correct', 'Also right');
check('n-prof', "l'enseignant (m)", 'wrong', '= teacher.');
check('n-pere', 'le papa', 'correct', 'Also right: **le papa**');
check('n-papa', 'le père', 'wrong', '**le père** = father.');
check('n-mere', 'la maman', 'correct', 'Also right: **la maman**');
check('n-maman', 'la mère', 'wrong', '**la mère** = mother.');
check('x-ca-va', 'Comment allez-vous ?', 'correct', 'Also right');
check('x-comment-vas-tu', 'Ça va ?', 'correct', 'Also right: **Ça va ?**');
check('v-terminer', 'finir, finis, finis, finit, finissons, finissez, finissent', 'correct', 'Also right: **finir**');
check('v-finir', 'terminer\nje termine\ntu termines\nil termine\nnous terminons\nvous terminez\nils terminent', 'correct', 'Also right: **terminer**');
check('v-terminer', 'finir', 'partial', 'Also right: **finir**');
// confusables and kindOf are never accepted
check('x-a', 'dans', 'wrong', '**dans** = in, inside');
check('n-medecin', 'le docteur', 'wrong', '**le docteur** = doctor (as a title).');
check('n-nom-de-famille', 'le nom', 'wrong', 'is the general word');
// a lone gender letter is not another vocab word (an adjective alt like "x (m/f)" must not add "f" to the lookup)
check('n-prenom', 'f', 'wrong', '');
check('adj-grand', 'f', 'wrong', '');
check('n-lunettes', 'la lunette', 'partial', 'always plural');
// the plural of this word is a singular/plural slip, even when the plural is its own entry (les escargots = food)
check('n-escargot', 'les escargots', 'partial', "Give the singular: **l'escargot (m)**.");
expectNoNoteContaining('n-escargot', 'les escargots', 'snails (food)');
check('n-escargots', "l'escargot (m)", 'partial', 'always plural');
check('n-chat', 'les chats', 'partial', 'Give the singular: **le chat**.');
expectNoNoteContaining('n-chat', 'les chats', 'Almost');
check('n-soeur', 'la soeur', 'correct', 'œ');
check('n-equitation', "l'équitation (m)", 'wrong', '-tion / -sion are usually feminine');
check('n-image', "l'image (m)", 'wrong', 'exception');
check('n-collegue', 'la collègue', 'correct');
check('n-voisin', 'le voisin / la voisine', 'correct');
check('n-mer', 'la mère', 'wrong', 'mother');
check('n-lecon', 'le cours', 'correct', 'Also right');
check('n-beau-fils', 'le gendre', 'correct', 'Also right: **le gendre** = son-in-law.');
check('n-gendre', 'le beau-fils', 'correct', 'Also right: **le beau-fils**');
check('n-pluie', '?', 'wrong');
check('n-pluie', '', 'wrong');
check('c-hongrie', 'la Hongrie', 'correct');
// Adjectives
check('adj-bruyant', 'bruyant / bruyante', 'correct');
check('adj-bruyant', 'bruyant, bruyante', 'correct');
check('adj-bruyant', 'bruyant - bruyante', 'correct');
check('adj-bruyant', 'bruyant / bruyant', 'partial', 'add -e');
check('adj-ennuyeux', 'ennuyeux / ennuyeuxe', 'partial', '-eux → -euse');
check('adj-ennuyeux', 'bruyant / bruyante', 'wrong', '**bruyant** = noisy');
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
check('v-apprendre', "étudier, j'étudie, étudies, étudie, étudions, étudiez, étudient", 'wrong', '**étudier** = to study');
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
// a/à, ou/où, la/là: the accent makes it another word, not a spelling slip
check('x-ou', 'où', 'wrong', '**où** = where.');
check('x-ou-where', 'ou', 'wrong', '**ou** = or.');
check('x-a', 'a', 'wrong', '**a** = has');
check('x-la-there', 'la', 'wrong', '**la** = the (feminine).');
check('x-merci', 'merçi', 'partial', 'Accent');
// Fill-ins
check('adj-bruyant', 'bruyante', 'correct', '', true);
check('adj-bruyant', 'bruyant', 'partial', 'agree', true);
check('v-manger', 'manges', 'correct', '', true);
check('v-payer', 'paie', 'correct', '', true);
check('v-payer', 'paye', 'correct', '', true);
check('v-payer', 'payons', 'partial', 'nous', true);
check('x-a', 'a', 'wrong', 'here you need **à**', true);
check('x-ou-where', 'ou', 'wrong', 'here you need **où**', true);
// Fill-ins accept alts and acceptedSynonyms only when they fit the blank: the same gender (the one the sentence was written
// with), number and elision (l'___); verbs the same person
checkFillIn('n-evenement', 'photos de l', 'évènement', 'correct');
checkFillIn('n-evenement', 'photos de l', "l'évènement", 'correct');
checkFillIn('n-evenement', 'photos de l', 'evenement', 'partial', 'Accent');
checkFillIn('n-cle', 'Ce sont nos', 'clefs', 'correct');
checkFillIn('n-cle', 'Ce sont nos', 'clef', 'partial', 'singular / plural');
checkFillIn('n-foot', 'Ils jouent', 'football', 'correct');
checkFillIn('n-e-mail', "beaucoup d'", 'courriels', 'partial', "doesn't fit after **d'**");
checkFillIn('n-plombier', 'la douche', 'plombière', 'partial', 'The sentence uses the masculine: **plombier**.');
checkFillIn('nat-hollandais', 'elle est', 'néerlandaise', 'correct');
checkFillIn('nat-hollandais', 'elle est', 'néerlandais', 'partial', 'must agree');
// examples with only an alt become fill-ins, and the alt's gender is the one the sentence needs
checkFillIn('n-avocat', 'Elle est avocate', 'avocate', 'correct');
checkFillIn('n-avocat', 'Elle est avocate', 'avocat', 'partial', 'The sentence uses the feminine: **avocate**.');
checkFillIn('x-tous-les', 'champignons', 'toutes les', 'partial', 'another form of this expression, but the sentence uses **tous les**');
checkFillIn('x-s-il-te-plait', 'épeler', "s'il vous plaît", 'partial', 'the sentence uses **s\'il te plaît**');
// anyWording: every wording of the expression is right in that sentence
checkFillIn('x-je-suis-desole', 'macarons', 'Je suis désolée', 'correct');
checkFillIn('x-tu-es-ou', 'fromagère', 'Où es-tu ?', 'correct');
checkFillIn('x-un-peu', 'espagnol', 'un peu', 'correct');
// acceptedSynonyms in fill-ins
checkFillIn('n-frigo', 'Dans mon', 'réfrigérateur', 'correct', 'Also right: **le réfrigérateur**');
checkFillIn('n-lieu', 'très calme', 'endroit', 'correct', 'Also right');
checkFillIn('n-menu', 'Voici le', 'carte', 'partial', "it's feminine and the sentence uses the masculine: here it's **menu**");
checkFillIn('n-objet', "beaucoup d'", 'choses', 'partial', 'feminine');
checkFillIn('v-finir', 'Le cours', 'termine', 'correct', 'Also right: **terminer**');
checkFillIn('v-terminer', 'On ', 'finit', 'correct', 'Also right: **finir**');
checkFillIn('v-terminer', 'On ', 'finis', 'partial', 'the **je** form');
checkFillIn('v-pratiquer', 'Quel sport', 'faites', 'correct', 'Also right');
checkFillIn('adj-decede', 'paternels', 'morts', 'correct', 'Also right: **mort**');
checkFillIn('adj-decede', 'paternels', 'mort', 'partial', 'the sentence needs the plural');
checkFillIn('adj-super', 'Saint-Laurent', 'géniale', 'partial', 'the same in both genders');
checkFillIn('x-alors', 'fraises', 'donc', 'correct', 'Also right: **donc**');
// The sentence decides the gender even when the article doesn't (l'assistant / l'assistante); eitherGender opens it up
{
  const assistant = {
    id: 'n-test-assistant', type: 'noun', en: 'assistant', fr: 'assistant', gender: 'm', article: "l'", themes: ['Jobs & work'],
    alt: ["l'assistante (f)"],
    examples: [
      { fr: "L'assistante de mon ami s'appelle Julia.", en: "My friend's assistant is called Julia." },
      { fr: "L'assistant de mon ami s'appelle Peter.", en: "My friend's assistant is called Peter." },
      { fr: "J'ai parlé avec l'assistant.", en: 'I spoke to the assistant.', eitherGender: true },
    ],
  };
  const vegetarian = {
    id: 'adj-test-vegetarien', type: 'adjective', en: 'vegetarian', masc: 'végétarien', fem: 'végétarienne', themes: ['Food & drink'],
    examples: [
      { fr: 'Je suis végétarienne.', en: "I'm vegetarian.", eitherGender: true },
      { fr: 'Ma sœur est végétarienne.', en: 'My sister is vegetarian.' },
    ],
  };
  const testCtx = { lookup: buildLookup([assistant, vegetarian]) };
  checkFillIn(assistant, 'Julia', 'assistante', 'correct', '', testCtx);
  checkFillIn(assistant, 'Julia', 'assistant', 'partial', 'The sentence uses the feminine: **assistante**.', testCtx);
  checkFillIn(assistant, 'Peter', 'assistant', 'correct', '', testCtx);
  checkFillIn(assistant, 'Peter', 'assistante', 'partial', 'The sentence uses the masculine: **assistant**.', testCtx);
  checkFillIn(assistant, 'parlé', 'assistant', 'correct', '', testCtx);
  checkFillIn(assistant, 'parlé', 'assistante', 'correct', 'Either gender works in this sentence.', testCtx);
  checkFillIn(vegetarian, 'Je suis', 'végétarien', 'correct', 'Either gender works in this sentence.', testCtx);
  checkFillIn(vegetarian, 'Je suis', 'végétariens', 'partial', 'must agree', testCtx);
  checkFillIn(vegetarian, 'Ma sœur', 'végétarien', 'partial', 'must agree', testCtx);
  const julia = buildFillIn({ ...assistant, examples: [assistant.examples[0]] });
  const ok = julia.answer === 'assistante' && julia.sentence === "L'______ de mon ami s'appelle Julia.";
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} fill-in blanks the whole word "assistante", not "assistant" inside it (${julia.sentence})`);
}

// Grades a fill-in built from the one example that contains exampleFragment
function checkFillIn(idOrEntry, exampleFragment, answer, expectedResult, expectedNoteFragment = '', gradeCtx = ctx) {
  const entry = typeof idOrEntry === 'string' ? byId.get(idOrEntry) : idOrEntry;
  const example = (entry.examples || []).find((e) => e.fr.includes(exampleFragment));
  const fillIn = example && buildFillIn({ ...entry, examples: [example] });
  if (!fillIn) {
    failures++;
    console.log(`✗ ${entry.id}: no fill-in from an example containing "${exampleFragment}"`);
    return;
  }
  const graded = gradeItem({ entry, fillIn, example }, answer, gradeCtx);
  const notes = graded.notes.join(' | ');
  const ok = graded.result === expectedResult && notes.includes(expectedNoteFragment);
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${entry.id} [${fillIn.sentence}] "${answer}" → ${graded.result}${ok ? '' : ` (expected ${expectedResult}${expectedNoteFragment ? ` + "${expectedNoteFragment}"` : ''})`}\n    ${notes}`);
}

// kindOf: base word answered correctly lists its kinds
check('n-sac', 'le sac', 'correct', 'Also: **le sac à dos** (backpack, rucksack) · **le sac de sport** (sports bag) · **le sac à main** (handbag) · **le sac à ordinateur** (laptop bag)');
check('n-sac', 'la sac', 'wrong');
expectNoNoteContaining('n-sac', 'la sac', 'Also:');
check('adj-bleu', 'bleu / bleue', 'correct', '**bleu foncé** (dark blue)');
// kindOf: wrong answer that is another entry
check('n-bouteille-en-plastique', 'la bouteille', 'wrong', 'Almost: **la bouteille** (bottle) is the general word; this one is more specific.');
check('adj-bleu-fonce', 'bleu / bleue', 'wrong', 'Almost: **bleu** (blue) is the general word');
check('n-sac-a-dos', 'le sac à main', 'wrong', "That's another kind of **sac**: **le sac à main** = handbag.");
check('n-marchand', 'le vendeur', 'wrong', '**le vendeur** = salesperson, shop assistant.');
check('n-pomme-de-terre', 'la pomme', 'wrong', '**la pomme** = apple.');
check('n-tarte-au-citron', 'la tarte au citron meringuée', 'wrong', "That's another kind of **tarte**: **la tarte au citron meringuée** = lemon meringue tart.");
check('n-tarte-au-citron-meringuee', 'la tarte citron meringuée', 'correct');
check('n-pomme', 'la banane', 'wrong', '**la banane** = banana. | **la banane** = bum bag, fanny pack.');
// No kindOf and no kinds: notes as before
check('n-quartier', 'le quartier', 'correct');
expectNoNoteContaining('n-quartier', 'le quartier', '');
check('n-mer', 'la mère', 'wrong', '**la mère** = mother.');

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

// Invalid acceptedSynonyms links: warning, link ignored (never accepted), no crash
{
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (message) => warnings.push(message);
  const noun = (id, fr, extra = {}) => ({ id, type: 'noun', en: id, fr, gender: 'm', article: 'le', ...extra });
  const testWords = [
    noun('n-base', 'base'),
    noun('n-kind-a', 'kind a', { kindOf: 'n-base', acceptedSynonyms: ['n-base', 'n-kind-b'] }), // its base, and another kind of it
    noun('n-kind-b', 'kind b', { kindOf: 'n-base' }),
    noun('n-mix', 'mix', { confusables: ['n-mixed'], acceptedSynonyms: ['n-mixed'] }), // confusable on this side
    noun('n-mixed', 'mixed', { confusables: ['n-mix'] }),
    noun('n-one-way', 'one way', { acceptedSynonyms: ['n-mix'] }), // n-mix has no confusable with n-one-way: valid
    noun('n-other-side', 'other side', { acceptedSynonyms: ['n-mixed'] }), // fine
    noun('n-broken', 'broken', { acceptedSynonyms: ['n-broken', 'n-missing', 'x-phrase'] }),
    { id: 'x-phrase', type: 'expression', en: 'phrase', fr: 'phrase' },
  ];
  let testLookup;
  try { testLookup = buildLookup(testWords); } finally { console.warn = originalWarn; }
  const byTestId = new Map(testWords.map((w) => [w.id, w]));
  const synonymsOf = (id) => [...testLookup.synonymIdsOf(byTestId.get(id))].join();
  const grade = (id, answer) => gradeItem({ entry: byTestId.get(id) }, answer, { lookup: testLookup });
  const warned = (id, other) => warnings.some((w) => w.includes(`${id} has acceptedSynonyms "${other}"`));
  const results = [
    ['6 warnings logged', warnings.length === 6],
    ['kindOf base and sibling ignored', synonymsOf('n-kind-a') === '' && warned('n-kind-a', 'n-base') && warned('n-kind-a', 'n-kind-b')],
    ['confusable ignored', synonymsOf('n-mix') === '' && warned('n-mix', 'n-mixed') && grade('n-mix', 'le mixed').result === 'wrong'],
    ['self, missing id and other type ignored', synonymsOf('n-broken') === '' && ['n-broken', 'n-missing', 'x-phrase'].every((o) => warned('n-broken', o))],
    ['valid links kept and accepted', synonymsOf('n-one-way') === 'n-mix' && grade('n-one-way', 'le mix').result === 'correct'],
    ['one direction only', grade('n-mix', 'le one way').result === 'wrong' && grade('n-other-side', 'le mixed').result === 'correct'],
  ];
  for (const [name, ok] of results) {
    if (!ok) failures++;
    console.log(`${ok ? '✓' : '✗'} invalid acceptedSynonyms: ${name}`);
  }
  if (!results[0][1]) console.log(`    warnings: ${warnings.join(' | ')}`);
}

const fill = buildFillIn(byId.get('adj-bruyant'));
console.log(`\nFill-in sample: ${fill.sentence} (${fill.hint}) — ${fill.example.en} → ${fill.answer}`);

// Several examples: fill-ins only use examples that can be blanked; each item keeps one example.
{
  const bruyant = byId.get('adj-bruyant');
  const unusable = [{ fr: 'Il fait beau.', en: 'The weather is nice.' }, { fr: bruyant.examples[0].fr }];
  const usable = [bruyant.examples[0], { fr: 'Ma rue est bruyante.', en: 'My street is noisy.' }];
  const severalExamples = { ...bruyant, id: 'test-several', examples: [...unusable, ...usable] };
  const noExamples = { ...bruyant, id: 'test-none', examples: undefined };
  const onlyUnusable = { ...bruyant, id: 'test-unusable', examples: unusable };
  const pickedSentences = new Set([0, 0.99].map((r) => buildFillIn(severalExamples, () => r).example.fr));
  const itemsChecks = [
    ['fill-in picks only usable examples', pickedSentences.size === 2 && [...pickedSentences].every((fr) => usable.some((e) => e.fr === fr))],
    ['no examples → no fill-in', buildFillIn(noExamples) === null],
    ['no usable example → no fill-in', buildFillIn(onlyUnusable) === null],
  ];
  for (let run = 0; run < 50; run++) {
    const items = buildItems([severalExamples, noExamples, onlyUnusable, byId.get('x-a')]);
    const [several, none, unusableItem, xA] = items;
    itemsChecks.push(
      ['fill-in item uses its fill-in example', !several.fillIn || several.example === several.fillIn.example],
      ['item example is one of its examples', severalExamples.examples.includes(several.example) && byId.get('x-a').examples.includes(xA.example)],
      ['entry without examples works', !none.fillIn && none.example === null && gradeItem(none, 'bruyant / bruyante', ctx).result === 'correct'],
      ['entry without usable example is a vocab card', !unusableItem.fillIn && onlyUnusable.examples.includes(unusableItem.example)],
    );
  }
  const passedByName = new Map();
  for (const [name, ok] of itemsChecks) passedByName.set(name, (passedByName.get(name) ?? true) && ok);
  for (const [name, ok] of passedByName) {
    if (!ok) failures++;
    console.log(`${ok ? '✓' : '✗'} examples: ${name}`);
  }
}
console.log(failures ? `\n✗ ${failures} check(s) failed` : '\n✓ all checks passed');
process.exit(failures ? 1 : 0);
