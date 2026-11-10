# French vocabulary trainer

Offline-first PWA for practising A1 French vocabulary. Plain HTML/CSS/vanilla JS (ES modules), no framework, no build step.
Hosted on GitHub Pages (auto-deploys on push to `main`); progress syncs through Firebase (Google sign-in + Firestore).

## Project structure

| Path | What it is |
| --- | --- |
| `vocab.json` | **All vocabulary — the single source of truth.** |
| `index.html`, `style.css` | Page shell and styles |
| `js/app.js` | UI: sign-in, practice set → Check → results table → Next set (key `N`), status line, Online switch, vocab/app update checks |
| `js/grading.js` | Rule-based grading and explanations (pure functions, also runs in Node). `buildLookup` = reverse index answer → entries, plus the `kindOf` links |
| `js/selection.js` | Leitner boxes from the attempt log, choosing the 10 words, building sentence fill-ins |
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

Common fields: `id` (stable, never change it), `type`, `en` (the English prompt), `themes`, optional `alt` (other accepted spellings of this entry: gendered forms, or wordings with exactly the same meaning), `examples` (array of `{ "fr", "en" }`, even for one sentence; leave it out if there are none), `tip`, `confusables` (ids like `n-glace`, or plain words like `"la mare"`), `kindOf` (id of a more general base word, placed right after `themes`: `n-sac-a-dos` has `"kindOf": "n-sac"`), `acceptedSynonyms` (ids of other entries also accepted on this card, placed after `kindOf`, or after `themes` if there is none: `"acceptedSynonyms": ["n-metier"]`).

**Key order** in each entry (a readability convention; the app and `validate.js` don't depend on it): `id`, `type`, `en`, then the type's own fields (`fr`, `gender`, `article`, `inTo`, `pluralOnly` · `infinitive`, `conj`, `conjAlt`, `rule` · `masc`, `fem`), then `themes`, `kindOf`, `acceptedSynonyms`, `alt`, `tip`, `confusables`, `examples`. Leave out fields an entry doesn't have.

**themes**: 1–3 names from the top-level `themes` list (which sets their order); the first is the entry's main theme. Themes are topics, not grammar: verbs go under what they're about (`v-nager` → `Sports`), and basic verbs, adjectives and nouns that fit no topic go in `Common words`. The conjugation group is in `rule`, not in a theme. Only add a second theme if the word belongs in a practice session on that topic (`n-boulanger`: `["Jobs & work", "Shopping"]`); `Oral exam` is only ever a second theme, after `Questions`. A new theme goes in the top-level list first — `validate.js` reports unknown or repeated themes as errors and empty themes as a warning.

**kindOf**: only on the specific entry; the base word doesn't list its kinds (the app collects them). The base must exist, must not be the entry itself and must not have its own `kindOf` — `validate.js` reports these as errors, and the app logs a warning and ignores the link. Use it when the specific word is still the same kind of thing (backpack → bag); if the meaning changes, use `confusables` (pomme / pomme de terre). Full rules: "French–English Vocabulary.md" → "For vocab.json: entries to add" → "How to convert".

**acceptedSynonyms**: one direction only — the listed entries are accepted on this entry's card, not the other way round. For a two-way pair, list it on both entries (`n-travail` ↔ `n-metier`); one-way where the other prompt asks for a specific register (`n-enseignant` → `n-prof`, but "teacher (informal)" doesn't accept enseignant). Works for verbs too (`v-terminer` ↔ `v-finir`), which have no `alt`. A synonym answer is graded with the other entry's own rules (its alts, both adjective forms, full conjugation) and counts as correct in the Leitner boxes. Each id must exist, be a different entry of the same type, and not be a confusable (either direction) or a kindOf base / kind / sibling — `validate.js` reports these as errors, and the app logs a warning and ignores the link.

**One relation per id**: for an entry, an id is only ever one of `kindOf`, `acceptedSynonyms`, `confusables` or `alt` (an alt that is another entry's own word counts as that id). Confusables are never accepted as each other's answer, so the other entry mustn't accept or kindOf-link this one either. `validate.js` enforces both. Confusables usually go both ways, but one-way is fine when the trap only exists in one direction: `n-voiture` lists `n-car` (the English prompt "car"), `n-car` doesn't list `n-voiture`. Confusables are only checked by `validate.js` and block `acceptedSynonyms`; the app never shows them, so a wrong answer that is another entry gets its `le car = coach.` note either way.

**Feedback that uses these fields** (in `js/grading.js`, results page only):
- Correct answer to a base word → `Also: le sac à dos (backpack, rucksack) · …` listing its kinds.
- Wrong answer that is another entry (all matches, verbs by infinitive only) → `Almost: la bouteille (bottle) is the general word; …` if it is the prompt's base word, `That's another kind of sac: le sac à main = handbag.` if it shares the base, otherwise `la pomme = apple.` (confusables included).
- Answer that is an `acceptedSynonyms` entry of the prompt → `Also right: le métier = job, trade. The word we were after: le travail.` and the synonym's own grade (correct for a full answer). Without a link, another entry is always wrong.
- The plural of the prompt's own noun is a singular/plural slip (`Give the singular: l'escargot (m).`), even if the plural is its own `pluralOnly` entry (`n-escargots`).
- a / à, ou / où, la / là: a missing or extra accent is another word, not an accent slip → wrong, `ou = or. The accent makes it a different word: here you need où.` (list in `WORDS_TOLD_APART_BY_ACCENT`).

| type | fields | example |
| --- | --- | --- |
| `noun` | `fr` (no article), `gender` `m`/`f`/`mf`, `article` `le`/`la`/`l'`/`les`, `pluralOnly` (true for `les`) | `{"id":"n-hopital","type":"noun","en":"hospital","fr":"hôpital","gender":"m","article":"l'","themes":["Home & town"]}` |
| `verb` | `infinitive`, `conj` = 6 forms je, tu, il, nous, vous, ils **without subject pronouns** (keep `j'`, keep reflexive `me`/`te`/`se`/`nous`/`vous`), optional `rule`: `-ger` `-cer` `-yer` `é→è` `e→è` `double-l` `-ir-iss` `-re` `irregular`, optional `conjAlt` = a complete second accepted conjugation, 6 forms like `conj`, repeating the `conj` form where a person has no other spelling (each person accepts either form) | `"conj":["mange","manges","mange","mangeons","mangez","mangent"],"rule":"-ger"`; `"conj":["paie","paies","paie","payons","payez","paient"],"conjAlt":["paye","payes","paye","payons","payez","payent"]` |
| `adjective` | `masc` (or `null` if feminine-only), `fem`; `alt` entries are `"masc / fem"` | `{"masc":"bruyant","fem":"bruyante"}` |
| `country` | like noun (`article` may be `""`, e.g. Malte) + `inTo` (`"en Hongrie"`) | |
| `expression` | `fr`; `alt` for other accepted wordings | `{"fr":"Je ne sais pas.","en":"I don't know."}` |
| `number` | `fr` in words, `en` is the digits | `{"id":"num-21","fr":"vingt et un","en":"21"}` |

Nationalities are `adjective` entries with ids `nat-…` and themes `["Nationalities"]`.
Alternatives for paired nouns go in `alt` as full answers: `"alt": ["la voisine"]`, `"alt": ["l'amie (f)"]`.

**Id convention** (only for new words; existing ids never change, even if the word is edited):
prefix + slug of the French without accents: `n-` noun, `v-` verb, `adj-` adjective, `nat-` nationality, `c-` country, `x-` expression, `num-` number. `œ` → `oe`. Example: `la sœur` → `n-soeur`. If the slug is taken, add a meaning suffix (`x-ou-where`).

Examples should be simple A1 sentences that contain the word, with an English translation, one `{fr, en}` object per sentence (never several sentences in one string). Each set picks one example per word at random: fill-ins choose among the examples that contain the word, and the results page shows the same example the card used. Don't use the user's real name, surname, birthday or other personal details in examples (the repo is public).

## How to add or change words

1. Edit `vocab.json`:
   - **Add:** new entry with a new unique id (convention above) and an example sentence.
   - **Change:** edit fields in place; **keep the `id`** so the progress stays.
   - **Remove:** delete the entry (its history is then ignored).
2. Increase `version` by 1 (the app compares versions to pick up the change).
3. Run `node scripts/validate.js` — must print ✓. If grading code changed, also run `node scripts/test-grading.js`.
4. Commit and push to `main`. GitHub Pages redeploys within a minute or two; the app downloads the new vocab next time it is opened online and shows "Vocabulary updated: +N words".

On this Windows machine Node is at `C:\Program Files\nodejs` (add it to PATH in PowerShell if `node` isn't found: `$env:Path = "C:\Program Files\nodejs;" + $env:Path`).

## Changing app code

Bump `CACHE_VERSION` in `sw.js` whenever any app file other than `vocab.json` changes, otherwise installed copies keep the old files. If you add a new file, add it to `APP_FILES` in `sw.js`. If the Firebase SDK version changes, update it in both `js/sync.js` and `sw.js`.

Test locally with any static server from the repo root (e.g. `npx serve .`, then open `http://localhost:3000/local.html` for the no-sign-in version, or `/` for the synced one) — sign-in needs `localhost` in Firebase's authorised domains (it is there by default). After code changes, reload with Ctrl+Shift+R so the service worker doesn't serve the old files.

`scripts/test-grading.js` checks grading against the real `vocab.json` (including the kindOf feedback and invalid-link warnings); add a `check(id, answer, expectedResult, noteFragment)` line when grading changes.
