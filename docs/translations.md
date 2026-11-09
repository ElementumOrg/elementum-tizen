# Translations

The app is available in 22 languages, the same set as the Elementum addon. `en` is the source; every other
language was **machine-drafted** (strings that match the addon's `.po` files exactly were taken from there, the
rest were drafted by an AI model) and **needs native-speaker review**. Corrections are very welcome.

| Language | Id | File | Status |
|---|---|---|---|
| English | `en_gb` | `en.json` | source |
| Deutsch | `de_de` | `de_de.json` | machine-drafted, needs native review |
| Ελληνικά | `el_gr` | `el_gr.json` | machine-drafted, needs native review |
| Español (Argentina) | `es_ar` | `es_ar.json` | machine-drafted, needs native review |
| Español (España) | `es_es` | `es_es.json` | machine-drafted, needs native review |
| Español (México) | `es_mx` | `es_mx.json` | machine-drafted, needs native review |
| Suomi | `fi_fi` | `fi_fi.json` | machine-drafted, needs native review |
| Français | `fr_fr` | `fr_fr.json` | machine-drafted, needs native review |
| עברית | `he_il` | `he_il.json` | machine-drafted, needs native review |
| Hrvatski | `hr_hr` | `hr_hr.json` | machine-drafted, needs native review |
| Magyar | `hu_hu` | `hu_hu.json` | machine-drafted, needs native review |
| Italiano | `it_it` | `it_it.json` | machine-drafted, needs native review |
| Nederlands | `nl_nl` | `nl_nl.json` | machine-drafted, needs native review |
| Polski | `pl_pl` | `pl_pl.json` | machine-drafted, needs native review |
| Português (Brasil) | `pt_br` | `pt_br.json` | machine-drafted, needs native review |
| Português (Portugal) | `pt_pt` | `pt_pt.json` | machine-drafted, needs native review |
| Română | `ro_ro` | `ro_ro.json` | machine-drafted, needs native review |
| Русский | `ru_ru` | `ru_ru.json` | machine-drafted, needs native review |
| Slovenčina | `sk_sk` | `sk_sk.json` | machine-drafted, needs native review |
| Slovenščina | `sl_si` | `sl_si.json` | machine-drafted, needs native review |
| Svenska | `sv_se` | `sv_se.json` | machine-drafted, needs native review |
| Українська | `uk_ua` | `uk_ua.json` | machine-drafted, needs native review |

## How to contribute

1. Edit `src/i18n/<id>.json` (flat `"key": "text"` pairs). Use `en.json` as the reference.
2. Keep every `{placeholder}` exactly as in English (same names; you may reorder them within the sentence).
3. Run `npm test`. `test/i18n-complete.test.ts` fails if a language is missing a key that `en.json` has, has a
   stale key, or has different placeholders than English.
4. Open a pull request. Mention in it that you are a native speaker, and which strings you changed.

When `en.json` gets a new key, add it to every language file (the test enforces it). The helper
`node scripts/sync-languages.mjs` fills strings that match the addon's `.po` files exactly (it needs the addon
checked out at `../plugin.video.elementum`, or `ELEMENTUM_ADDON`).

## Known review points

- **ro:** "Librărie" for the library comes from the addon's `.po` file, but in Romanian it means "bookshop".
  A better word is probably "Bibliotecă".
- **Watchlist terms** ("Watchlist: movies", the tracker's watchlist, "Watched", "Collection") were written new
  for this app, not taken from the addon, and should be checked against how Trakt names them in your language.
- **es_ar / es_mx / es_es:** the three Spanish variants are drafts of the same text; check the vocabulary and
  the tú/vos forms that really differ between them.
- **ru / uk:** the person page's birth date ("Born {date}") uses a neutral wording because the sentence has to
  fit people of any gender; check that it reads naturally.
