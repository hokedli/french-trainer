# French vocabulary trainer

Offline-first PWA for practising A1 French vocabulary. Plain HTML/CSS/vanilla JS (ES modules), no framework, no build step.
Hosted on GitHub Pages (auto-deploys on push to `main`); progress syncs through Firebase (Google sign-in + Firestore).

## Project structure

| Path | What it is |
| --- | --- |
| `vocab.json` | **All vocabulary — the single source of truth.** |
| `index.html`, `style.css` | Page shell and styles |
| `js/app.js` | UI: sign-in, practice set → Check → results table → Next set (key `N`), status line, Online switch, vocab/app update checks |
| `js/grading.js` | Rule-based grading and explanations (pure functions, also runs in Node) |
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
{ "version": 7, "words": [ { "id": "n-quartier", "type": "noun", ... } ] }
```

Common fields: `id` (stable, never change it), `type`, `en` (the English prompt), `theme`, optional `alt` (other accepted answers), `example` `{ "fr", "en" }`, `tip`, `confusables` (ids like `n-glace`, or plain words like `"la mare"`).

| type | fields | example |
| --- | --- | --- |
| `noun` | `fr` (no article), `gender` `m`/`f`/`mf`, `article` `le`/`la`/`l'`/`les`, `pluralOnly` (true for `les`) | `{"id":"n-hopital","type":"noun","en":"hospital","fr":"hôpital","gender":"m","article":"l'","theme":"Home, places and transport"}` |
| `verb` | `infinitive`, `conj` = 6 forms je, tu, il, nous, vous, ils **without subject pronouns** (keep `j'`, keep reflexive `me`/`te`/`se`/`nous`/`vous`), optional `rule`: `-ger` `-cer` `é→è` `double-l` `-ir-iss` `-re` `irregular` | `"conj":["mange","manges","mange","mangeons","mangez","mangent"],"rule":"-ger"` |
| `adjective` | `masc` (or `null` if feminine-only), `fem`; `alt` entries are `"masc / fem"` | `{"masc":"bruyant","fem":"bruyante"}` |
| `country` | like noun (`article` may be `""`, e.g. Malte) + `inTo` (`"en Hongrie"`) | |
| `expression` | `fr`; `alt` for other accepted wordings | `{"fr":"Je ne sais pas.","en":"I don't know."}` |
| `number` | `fr` in words, `en` is the digits | `{"id":"num-21","fr":"vingt et un","en":"21"}` |

Nationalities are `adjective` entries with ids `nat-…` and theme `Nationalities`.
Alternatives for paired nouns go in `alt` as full answers: `"alt": ["la voisine"]`, `"alt": ["l'amie (f)"]`.

**Id convention** (only for new words; existing ids never change, even if the word is edited):
prefix + slug of the French without accents: `n-` noun, `v-` verb, `adj-` adjective, `nat-` nationality, `c-` country, `x-` expression, `num-` number. `œ` → `oe`. Example: `la sœur` → `n-soeur`. If the slug is taken, add a meaning suffix (`x-ou-where`).

Examples should be simple A1 sentences that contain the word, with an English translation — they are used for sentence fill-ins. Don't use the user's real name, surname, birthday or other personal details in examples (the repo is public).

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

Test locally with any static server from the repo root (e.g. `npx serve .`) — sign-in needs `localhost` in Firebase's authorised domains (it is there by default).
