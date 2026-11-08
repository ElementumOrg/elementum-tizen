import { expect, test } from 'vitest';

const files = import.meta.glob('../src/i18n/*.json', { eager: true, import: 'default' }) as Record<string, Record<string, string>>;
const en = files['../src/i18n/en.json'];
const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');

for (const [path, dict] of Object.entries(files)) {
  test(`${path.split('/').pop()} matches en.json`, () => {
    expect(Object.keys(en).filter((k) => !(k in dict)), 'missing keys').toEqual([]);
    expect(Object.keys(dict).filter((k) => !(k in en)), 'stale keys').toEqual([]);
    expect(Object.keys(dict).filter((k) => k in en && ph(dict[k]) !== ph(en[k])), 'placeholder mismatch').toEqual([]);
  });
}
