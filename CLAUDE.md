# French vocabulary trainer

Offline-first PWA for practising A1 French vocabulary. Plain HTML/CSS/vanilla JS (ES modules), no framework, no build step.
Hosted on GitHub Pages (auto-deploys on push to `main`); progress syncs through Firebase (Google sign-in + Firestore).

## Project structure

| Path | What it is |
| --- | --- |
| `vocab.json` | **All vocabulary — the single source of truth.** |
| `index.html`, `style.css` | Page shell and styles |
| `js/app.js` | UI: sign-in, practice set → Check → results table → Next set (key `N`), status line, Online switch, vocab/app update checks |
| `js/grading.js` | Rule-based grading and explanations (pure functions, also runs in Node). `buildLookup` = reverse index answer → entries, plus the `kindOf` and `acceptedSynonyms` links. `fillInForms` = every form of an entry that can stand in a sentence, with its slot (gender, number, elision, person); `gradeFillIn` grades sentence fill-ins |
| `js/selection.js` | Leitner boxes from the attempt log, choosing the 10 words, building sentence fill-ins (`blankExample` cuts a form out of an example and keeps its slot) |
| `js/seed-progress.js` | Starting Leitner boxes from the chat sessions before the app existed |
| `js/sync.js` | Firebase: sign-in, Firestore attempt log with persistent offline cache, `disableNetwork` for Offline mode |
| `js/firebase-config.js` | Public Firebase web config |
| `local.html`, `local.webmanifest`, `js/local-store.js` | Device-only version (no sign-in, no Firebase): same app, attempt log in localStorage. `app.js` picks `local-store.js` instead of `sync.js` when `<html data-mode="local">` |
| `sw.js` | Service worker: caches the app + Firebase SDK for offline use |
| `firestore.rules` | Security rules (deployed by pasting into the Firebase console → Firestore → Rules) |
| `scripts/validate.js` | Validates `vocab.json` |
| `scripts/test-grading.js` | Grading regression checks |

Progress lives in Firestore as an append-only log: `users/{uid}/attempts/{autoId}` = `{ wordId, result: correct|partial|wrong, myAnswer, timestamp, deviceId }`. Boxes are recomputed from the log; attempts for ids no longer in `vocab.json` are ignored.

## vocab.json format

```json
{ "version": 11, "themes": ["People & identity", ...], "words": [ { "id": "n-quartier", "type": "noun", ... } ] }
```

Common fields: `id` (stable, never change it), `type`, `en` (the English prompt), `themes`, optional `alt` (other accepted spellings of this entry: gendered forms, or wordings with exactly the same meaning; also used in sentence fill-ins), `examples` (array of `{ "fr", "en" }`, even for one sentence; leave it out if there are none; `en` left out on purpose stops fill-ins from that sentence; optional `"eitherGender": true` or `"anyWording": true` as a third key — see *Sentence fill-ins*), `tip`, `confusables` (ids like `n-glace`, or plain words like `"la mare"`), `kindOf` (id of a more general base word, placed right after `themes`: `n-sac-a-dos` has `"kindOf": "n-sac"`), `acceptedSynonyms` (ids of other entries also accepted on this card, placed after `kindOf`, or after `themes` if there is none: `"acceptedSynonyms": ["n-metier"]`).

**Key order** in each entry (a readability convention; the app and `validate.js` don't depend on it): `id`, `type`, `en`, then the type's own fields (`fr`, `gender`, `article`, `inTo`, `pluralOnly` · `infinitive`, `conj`, `conjAlt`, `rule` · `masc`, `fem`), then `themes`, `kindOf`, `acceptedSynonyms`, `alt`, `tip`, `confusables`, `examples`. Inside each example: `fr`, `en`, then `eitherGender` / `anyWording`. Leave out fields an entry doesn't have.

**themes**: 1–3 names from the top-level `themes` list (which sets their order); the first is the entry's main theme. Themes are topics, not grammar: verbs go under what they're about (`v-nager` → `Sports`), and basic verbs, adjectives and nouns that fit no topic go in `Common words`. The conjugation group is in `rule`, not in a theme. Only add a second theme if the word belongs in a practice session on that topic (`n-boulanger`: `["Jobs & work", "Shopping"]`); questions go under `Questions` first, then the topics they are about. A new theme goes in the top-level list first — `validate.js` reports unknown or repeated themes as errors and empty themes as a warning.

**kindOf**: only on the specific entry; the base word doesn't list its kinds (the app collects them). The base must exist, must not be the entry itself and must not have its own `kindOf` — `validate.js` reports these as errors, and the app logs a warning and ignores the link. Use it when the specific word is still the same kind of thing (backpack → bag); if the meaning changes, use `confusables` (pomme / pomme de terre). Full rules: "French–English Vocabulary.md" → "For vocab.json: entries to add" → "How to convert".

**acceptedSynonyms**: one direction only — the listed entries are accepted on this entry's card, not the other way round. For a two-way pair, list it on both entries (`n-travail` ↔ `n-metier`); one-way where the other prompt asks for a specific register (`n-enseignant` → `n-prof`, but "teacher (informal)" doesn't accept enseignant). Works for verbs too (`v-terminer` ↔ `v-finir`), which have no `alt`. On a card, a synonym answer is graded with the other entry's own rules (its alts, both adjective forms, full conjugation) and counts as correct in the Leitner boxes; in a sentence fill-in it must also fit the sentence (see *Sentence fill-ins*). Each id must exist, be a different entry of the same type, and not be a confusable (either direction) or a kindOf base / kind / sibling — `validate.js` reports these as errors, and the app logs a warning and ignores the link.

**One relation per id**: for an entry, an id is only ever one of `kindOf`, `acceptedSynonyms`, `confusables` or `alt` (an alt that is another entry's own word counts as that id). Confusables are never accepted as each other's answer, so the other entry mustn't accept or kindOf-link this one either. `validate.js` enforces both. Confusables usually go both ways, but one-way is fine when the trap only exists in one direction: `n-voiture` lists `n-car` (the English prompt "car"), `n-car` doesn't list `n-voiture`. Confusables are only checked by `validate.js` and block `acceptedSynonyms`; the app never shows them, so a wrong answer that is another entry gets its `le car = coach.` note either way.

**Feedback that uses these fields** (in `js/grading.js`, results page only):
- Correct answer to a base word → `Also: le sac à dos (backpack, rucksack) · …` listing its kinds.
- Wrong answer that is another entry (all matches, verbs by infinitive only) → `Almost: la bouteille (bottle) is the general word; …` if it is the prompt's base word, `That's another kind of sac: le sac à main = handbag.` if it shares the base, otherwise `la pomme = apple.` (confusables included).
- Answer that is an `acceptedSynonyms` entry of the prompt → `Also right: le métier = job, trade. The word we were after: le travail.` and the synonym's own grade (correct for a full answer; in a fill-in, correct if it fits the sentence). Without a link, another entry is always wrong.
- The plural of the prompt's own noun is a singular/plural slip (`Give the singular: l'escargot (m).`), even if the plural is its own `pluralOnly` entry (`n-escargots`).
- a / à, ou / où, la / là: a missing or extra accent is another word, not an accent slip → wrong, `ou = or. The accent makes it a different word: here you need où.` (list in `WORDS_TOLD_APART_BY_ACCENT`).

**Sentence fill-ins** (`fillInForms` / `gradeFillIn` in `js/grading.js`, `blankExample` in `js/selection.js`). Each set turns 1–2 of its words into a fill-in when one of their examples can be blanked:
- The blank is cut out of an example: the entry's own forms are tried first, longest first (noun and its plural, adjective masc/fem and their plurals, verb forms incl. `conjAlt` and the infinitive, expression without its final punctuation), then its `alt` forms, so `"Elle est avocate."` on `n-avocat` becomes a fill-in for `avocate` and `Je suis née…` on `x-je-suis-ne` one for `Je suis née`. A match never runs on into a letter (`assistant` is never found inside `assistante`). Plurals: +s; +x or +s after -au / -eu / -ou; unchanged after -s / -x / -z (a word that is the same in both, like `bus`, fits either number); a `les …` alt is a plural form (`les animaux`). Countries have no plural forms.
- **Examples without `en` never become fill-ins.** That is deliberate where another word fits the blank too (`Mon quartier est très sympa.` — assez, vraiment; `Le marchand vend des fruits.` — vendeur): don't add `en` to an existing fr-only example unless asked.
- The blanked form sets the **slot**: its gender and number (nouns, adjectives), whether it starts with a vowel or silent h (nouns: from its article, else its first letter; an h without an article is unknown and fits both), its person (verbs). The gender the example was written with is the gender the sentence needs, so `L'assistante de mon ami s'appelle Julia.` needs the feminine even though `l'` doesn't show it.
- Accepted as correct: any form of the entry, its alts or its `acceptedSynonyms` that fits the slot — same gender (a form that is the same for both genders fits any), same number, and fitting the word before the blank (after `l'` / `d'` / `qu'` it must start with a vowel or silent h; after `le la de du au ce ma ta sa que je ne me te se` it must not; after anything else either is fine); verbs: the same person (when a form is several persons, like `mange` = je / il, persons whose subject pronoun je / tu / nous / vous isn't in the sentence are dropped). `l'évènement` (alt) is right in `…photos de l'______.`; `réfrigérateur` (synonym) in `Dans mon ______`; `finit` (synonym) in `On ______ à 10 heures.` A typed article in front of a noun is ignored (`l'évènement`). A synonym answer gets the `Also right: …` note.
- Order of grading: a fitting form typed exactly → correct; an accent-pair slip (à / a) → wrong; a right word that doesn't fit → partial with the reason; a near spelling of a fitting form → partial (`Accent: …`, `Almost — …`); otherwise another vocab entry → wrong with its meaning (synonyms are never graded with their card rules here).
- A right word that doesn't fit → partial with the reason: `The sentence uses the masculine: plombier.`, `courriels is right, but it doesn't fit after d'`, `la carte (menu) is also right on its own, but it's feminine and the sentence uses the masculine: here it's menu.`, `mort (dead) is also right on its own, but the sentence needs the plural`, `finir (to finish) is also right on its own, but that's the je form`, adjectives `Right word, but it must agree with the noun here`, nouns `Right word — but here it's clés (singular / plural)`, verbs `That's the nous form of payer`. A blank whose word is the same in both genders (`super`, `magnifique`) can't check a gendered synonym, so `géniale` is partial there (`super is the same in both genders, so this sentence can't check the gender of géniale`).
- Expressions: only the wording in the sentence is right; the entry's other wordings (its main form or alts) are partial: `toutes les is another form of this expression, but the sentence uses tous les.` A synonym expression replaces it whole and is correct.
- **`anyWording: true`** on an expression's example: every wording of the entry (main form and alts) is right in that sentence (`Je suis désolé, nous n'avons pas de macarons…` accepts `Je suis désolée`, `Désolé`). Only for expression entries. Add it only when all the alts really fit — not for `tous les` / `toutes les` or `s'il te plaît` / `s'il vous plaît` after `Tu peux…`. `validate.js`: error if it isn't `true` or is on another type; warning if the example never becomes a fill-in or the entry has no alts.
- **`eitherGender: true`** on an example: the sentence leaves the gender open (`Je suis végétarienne.`, `Tu es pharmacienne.`, `Bonjour, enchantée !`), so forms of the other gender are correct too (`Either gender works in this sentence.`); number and elision still have to fit. Only for noun, country and adjective entries. Add it only when the other gender is really fine in that sentence — not when an article, `toute`, `il / elle est` or an agreeing word shows the gender. `validate.js`: error if it isn't `true` or is on another type; warning if the example never becomes a fill-in, the word has no differently spelt other-gender form (in the entry, its alts or synonyms), or a gendered word (`le`, `une`, `ma`, `il est`…) comes right before the blank.

| type | fields | example |
| --- | --- | --- |
| `noun` | `fr` (no article), `gender` `m`/`f`/`mf`, `article` `le`/`la`/`l'`/`les`, `pluralOnly` (true for `les`) | `{"id":"n-hopital","type":"noun","en":"hospital","fr":"hôpital","gender":"m","article":"l'","themes":["Town & places","Body & health"]}` |
| `verb` | `infinitive`, `conj` = 6 forms je, tu, il, nous, vous, ils **without subject pronouns** (keep `j'`, keep reflexive `me`/`te`/`se`/`nous`/`vous`), optional `rule`: `-ger` `-cer` `-yer` `é→è` `e→è` `double-l` `-ir-iss` `-re` `irregular`, optional `conjAlt` = a complete second accepted conjugation, 6 forms like `conj`, repeating the `conj` form where a person has no other spelling (each person accepts either form) | `"conj":["mange","manges","mange","mangeons","mangez","mangent"],"rule":"-ger"`; `"conj":["paie","paies","paie","payons","payez","paient"],"conjAlt":["paye","payes","paye","payons","payez","payent"]` |
| `adjective` | `masc` (or `null` if feminine-only), `fem`; `alt` entries are `"masc / fem"` | `{"masc":"bruyant","fem":"bruyante"}` |
| `country` | like noun (`article` may be `""`, e.g. Malte) + `inTo` (`"en Hongrie"`) | |
| `expression` | `fr`; `alt` for other accepted wordings | `{"fr":"Je ne sais pas.","en":"I don't know."}` |
| `number` | `fr` in words, `en` is the digits | `{"id":"num-21","fr":"vingt et un","en":"21"}` |

Nationalities are `adjective` entries with ids `nat-…` and themes `["Nationalities"]`.
Alternatives for paired nouns go in `alt` as full answers: `"alt": ["la voisine"]`, `"alt": ["l'amie (f)"]`.

**Id convention** (only for new words; existing ids never change, even if the word is edited):
prefix + slug of the French without accents: `n-` noun, `v-` verb, `adj-` adjective, `nat-` nationality, `c-` country, `x-` expression, `num-` number. `œ` → `oe`. Example: `la sœur` → `n-soeur`. If the slug is taken, add a meaning suffix (`x-ou-where`).

Examples should be simple A1 sentences that contain the word (or one of its alts), with an English translation, one `{fr, en}` object per sentence (never several sentences in one string). Write them so that only this word (or an accepted alt / synonym) fits the blank; if another word fits too, leave `en` out so no fill-in is built from it. Each set picks one example per word at random: fill-ins choose among the examples with `en` that contain the word, and the results page shows the same example the card used. Don't use the user's real name, surname, birthday or other personal details in examples (the repo is public).

## How to add or change words

1. Edit `vocab.json`:
   - **Add:** new entry with a new unique id (convention above) and an example sentence.
   - **Change:** edit fields in place; **keep the `id`** so the progress stays.
   - **Remove:** delete the entry (its history is then ignored).
2. Increase `version` by 1 (the app compares versions to pick up the change).
3. Run `node scripts/validate.js` — must print ✓. Warnings (e.g. an `eitherGender` / `anyWording` flag that does nothing) only show with `--verbose`. If grading code changed, also run `node scripts/test-grading.js`.
4. Commit and push to `main`. GitHub Pages redeploys within a minute or two; the app downloads the new vocab next time it is opened online and shows "Vocabulary updated: +N words".

On this Windows machine Node is at `C:\Program Files\nodejs` (add it to PATH in PowerShell if `node` isn't found: `$env:Path = "C:\Program Files\nodejs;" + $env:Path`).

## Changing app code

Bump `CACHE_VERSION` in `sw.js` whenever any app file other than `vocab.json` changes, otherwise installed copies keep the old files. If you add a new file, add it to `APP_FILES` in `sw.js`. If the Firebase SDK version changes, update it in both `js/sync.js` and `sw.js`.

Test locally with any static server from the repo root (e.g. `npx serve .`, then open `http://localhost:3000/local.html` for the no-sign-in version, or `/` for the synced one) — sign-in needs `localhost` in Firebase's authorised domains (it is there by default). After code changes, reload with Ctrl+Shift+R so the service worker doesn't serve the old files.

`scripts/test-grading.js` checks grading against the real `vocab.json` (including the kindOf feedback, invalid-link warnings and fill-ins; rules with no real example, like `eitherGender` on `l'assistant`, use small test-only entries); add a `check(id, answer, expectedResult, noteFragment)` line when grading changes, or for a fill-in `checkFillIn(id, exampleFragment, answer, expectedResult, noteFragment)`, which builds the fill-in from the one example containing `exampleFragment` (so the test doesn't depend on which example is picked at random).
