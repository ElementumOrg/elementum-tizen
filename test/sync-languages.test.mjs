import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { parsePo, prefill, syncLanguages } from '../scripts/sync-languages.mjs';

const fixtures = join(__dirname, 'fixtures/language');
const po = readFileSync(join(fixtures, 'resource.language.de_de/strings.po'), 'utf8');

test('parsePo reads entries, continuation lines and escapes', () => {
  const entries = parsePo(po);
  expect(entries[0]).toEqual({ msgid: '', msgstr: 'Language: de\n' });
  expect(entries).toContainEqual({ msgctxt: '#30000', msgid: 'Settings', msgstr: 'Einstellungen' });
  expect(entries).toContainEqual({ msgctxt: '#30002', msgid: 'Long line', msgstr: 'Lange Zeile' });
  expect(entries).toContainEqual({ msgctxt: '#30006', msgid: 'Say "hi"', msgstr: 'Sag "hallo"' });
});

test('prefill matches exact msgids, skips empty/markup/printf/untranslated, keeps manual entries', () => {
  const en = {
    a: 'Settings', b: 'Search', c: 'Long line', d: 'Password', e: 'Yes (%s seconds)', f: 'Bold', g: 'Port', h: 'settings',
  };
  const { dict, added } = prefill(en, parsePo(po), { b: 'Manuell', old: 'Alt' });
  expect(dict).toEqual({ a: 'Einstellungen', b: 'Manuell', c: 'Lange Zeile', old: 'Alt' });
  expect(added).toBe(2);
});

test('syncLanguages writes one JSON per language except en_gb', () => {
  const dir = mkdtempSync(join(tmpdir(), 'i18n-'));
  try {
    writeFileSync(join(dir, 'en.json'), JSON.stringify({ x: 'Search', y: 'Nope' }));
    expect(syncLanguages(fixtures, dir)).toEqual({ de_de: 1 });
    expect(JSON.parse(readFileSync(join(dir, 'de_de.json'), 'utf8'))).toEqual({ x: 'Suche' });
    expect(existsSync(join(dir, 'en_gb.json'))).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
