// Flat JSON per language; en.json is the source, the others are filled by scripts/sync-languages.mjs and by hand.
import en from './en.json';
import { load, save } from '../settings';

/** Elementum's addon languages (resources/language/resource.language.<id>), named in their own language. */
export const LANGUAGES: Record<string, string> = {
  de_de: 'Deutsch',
  el_gr: 'Ελληνικά',
  en_gb: 'English',
  es_ar: 'Español (Argentina)',
  es_es: 'Español (España)',
  es_mx: 'Español (México)',
  fi_fi: 'Suomi',
  fr_fr: 'Français',
  he_il: 'עברית',
  hr_hr: 'Hrvatski',
  hu_hu: 'Magyar',
  it_it: 'Italiano',
  nl_nl: 'Nederlands',
  pl_pl: 'Polski',
  pt_br: 'Português (Brasil)',
  pt_pt: 'Português (Portugal)',
  ro_ro: 'Română',
  ru_ru: 'Русский',
  sk_sk: 'Slovenčina',
  sl_si: 'Slovenščina',
  sv_se: 'Svenska',
  uk_ua: 'Українська',
};

type Dict = Record<string, string>;
const files = import.meta.glob<Dict>('./*.json', { eager: true, import: 'default' });
const dicts: Record<string, Dict> = {};
for (const id in LANGUAGES) dicts[id] = files[`./${id}.json`] || {};
dicts.en_gb = en;

const saved = load('language');
let choice = saved in LANGUAGES ? saved : ''; // the user's choice; '' = follow the TV
let auto = 'en_gb'; // detected from the TV by initLanguage
let current = choice || auto;
const subs: Array<() => void> = [];

/** Translated text; `{name}` placeholders are filled from `vars`. Missing keys fall back to English, then to the key. */
export function t(key: string, vars?: Record<string, string | number>): string {
  const s = dicts[current][key] || (en as Dict)[key] || key;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}

/** The user's choice; '' = follow the TV. */
export const languageChoice = () => choice;

/** Current language id, e.g. `de_de`. */
export const language = () => current;

/** The `lang` API param for the current language, e.g. `de-DE`. */
export const apiLang = () => current.slice(0, 2) + '-' + current.slice(3).toUpperCase();

/** '' goes back to the TV language. Persists, and re-renders subscribers (App) without a reload. */
export function setLanguage(id: string) {
  choice = id in LANGUAGES ? id : '';
  save('language', choice);
  current = choice || auto;
  subs.forEach((f) => f());
}

export function onLanguageChange(fn: () => void): () => void {
  subs.push(fn);
  return () => {
    const i = subs.indexOf(fn);
    if (i >= 0) subs.splice(i, 1);
  };
}

/** Best match for a locale like `de_DE`, `de-DE`, `pt_BR.UTF-8` or `de`: exact, then `de_de`, then any `de_*`. */
export function matchLanguage(locale: string | undefined): string | undefined {
  if (!locale) return undefined;
  const parts = locale.replace(/[.@].*$/, '').toLowerCase().split(/[_-]/);
  const lang = parts[0];
  const exact = `${lang}_${parts[1]}`;
  if (exact in LANGUAGES) return exact;
  if (`${lang}_${lang}` in LANGUAGES) return `${lang}_${lang}`;
  for (const id in LANGUAGES) if (id.split('_')[0] === lang) return id;
  return undefined;
}

function tizenLocale(): Promise<string | undefined> {
  return new Promise((resolve) => {
    try {
      if (typeof tizen === 'undefined') return resolve(undefined);
      // Don't block the boot if the callback never comes.
      setTimeout(() => resolve(undefined), 1000);
      tizen.systeminfo.getPropertyValue('LOCALE', (l) => resolve(l.language), () => resolve(undefined));
    } catch (_) {
      resolve(undefined);
    }
  });
}

/** Detects the TV language (Tizen LOCALE → navigator.language → English); a saved choice still wins. */
export async function initLanguage() {
  const nav = typeof navigator !== 'undefined' ? navigator.language : undefined;
  auto = matchLanguage(await tizenLocale()) || matchLanguage(nav) || 'en_gb';
  current = choice || auto;
}
