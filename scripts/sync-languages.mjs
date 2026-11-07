// Creates/updates src/i18n/<lang>.json for every language of the Elementum Kodi addon, pre-filling a key when
// its English text in en.json is exactly a .po msgid with a translation. Existing entries are never overwritten;
// keys without a match are left out and fall back to English at runtime.
// Env: ELEMENTUM_ADDON (default ../plugin.video.elementum).
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// printf placeholders and Kodi label markup ([B], [COLOR red], [CR], …) don't fit our plain strings.
const SKIP = /%[sd]|\[\/?(B|I|COLOR|CR|UPPERCASE|LOWERCASE|CAPITALIZE|LIGHT|TABS)\b[^\]]*\]/i;

const unquote = (s) => s.replace(/\\(.)/g, (_, c) => (c === 'n' ? '\n' : c === 't' ? '\t' : c));

/** Parses a gettext .po file into [{ msgctxt?, msgid, msgstr }], joining continuation lines. */
export function parsePo(text) {
  const entries = [];
  let cur = null;
  let field = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const m = /^(msgctxt|msgid|msgstr)\s+"(.*)"$/.exec(line);
    if (m) {
      if (!cur || m[1] === 'msgctxt' || (m[1] === 'msgid' && cur.msgid !== undefined)) entries.push((cur = {}));
      field = m[1];
      cur[field] = unquote(m[2]);
    } else if (field && /^".*"$/.test(line)) {
      cur[field] += unquote(line.slice(1, -1));
    } else {
      field = null;
    }
  }
  return entries;
}

/** Returns the language's dictionary: existing entries kept, en keys pre-filled from matching msgids. */
export function prefill(en, entries, existing) {
  const byId = new Map();
  for (const e of entries) {
    if (e.msgid && e.msgstr && e.msgstr !== e.msgid && !byId.has(e.msgid) && !SKIP.test(e.msgid) && !SKIP.test(e.msgstr)) {
      byId.set(e.msgid, e.msgstr);
    }
  }
  const out = {};
  let added = 0;
  for (const key of Object.keys(en)) {
    if (key in existing) out[key] = existing[key];
    else if (byId.has(en[key])) {
      out[key] = byId.get(en[key]);
      added++;
    }
  }
  for (const key of Object.keys(existing)) if (!(key in out)) out[key] = existing[key];
  return { dict: out, added };
}

/** Syncs every resource.language.* folder except en_gb (en.json is the source); returns pre-filled counts. */
export function syncLanguages(languageDir, i18nDir) {
  const en = JSON.parse(readFileSync(join(i18nDir, 'en.json'), 'utf8'));
  const added = {};
  for (const dir of readdirSync(languageDir).sort()) {
    const id = dir.replace(/^resource\.language\./, '');
    if (id === dir || id === 'en_gb') continue;
    const file = join(i18nDir, `${id}.json`);
    const existing = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
    const po = parsePo(readFileSync(join(languageDir, dir, 'strings.po'), 'utf8'));
    const r = prefill(en, po, existing);
    writeFileSync(file, JSON.stringify(r.dict, null, 2) + '\n');
    added[id] = r.added;
  }
  return added;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const addon = resolve(root, process.env.ELEMENTUM_ADDON || '../plugin.video.elementum');
  const added = syncLanguages(join(addon, 'resources/language'), join(root, 'src/i18n'));
  for (const id in added) console.log(`${id}: +${added[id]}`);
}
