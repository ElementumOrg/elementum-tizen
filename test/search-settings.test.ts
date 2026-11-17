import { expect, test } from 'vitest';
import {
  enabledNames, groupOptions, isSecret, optionText, parseValue, providerLine, providersOf, valueText,
  type Option, type Provider,
} from '../src/screens/search-settings-util';

const opt = (o: Partial<Option> & { id: string }): Option => ({ group: 'General', label: o.id, value: '', default: '', ...o });
const prov = (p: Partial<Provider> & { id: string }): Provider =>
  ({ name: p.id, private: false, languages: ['en'], enabled: true, searched: true, has_secret: false, ...p });

test('groups options in server order and leaves out the cookie sync rows of their own', () => {
  const g = groupOptions([
    opt({ id: 'max_results' }),
    opt({ id: 'cookie_sync_enabled', group: 'Cookie sync', value: false }),
    opt({ id: 'cookie_sync_token', group: 'Cookie sync' }),
    opt({ id: 'cookie_sync_user', group: 'Cookie sync' }),
    opt({ id: 'cookie_sync_gist_id', group: 'Cookie sync' }),
    opt({ id: 'filter_cam', group: 'Release type', value: false }),
    opt({ id: 'min_size' }),
  ]);
  expect(g.map((x) => [x.name, x.cookie, x.options.map((o) => o.id)])).toEqual([
    ['General', false, ['max_results', 'min_size']],
    ['Cookie sync', true, ['cookie_sync_enabled']],
    ['Release type', false, ['filter_cam']],
  ]);
});

test('shows values: switches, choices, empty text, numbers', () => {
  expect(valueText(opt({ id: 'a', value: true }))).toBe('✓');
  expect(valueText(opt({ id: 'a', value: false }))).toBe('–');
  expect(valueText(opt({ id: 'sort_by', value: 1, choices: ['Resolution', 'Seeds'] }))).toBe('Seeds');
  expect(valueText(opt({ id: 'sort_by', value: 7, choices: ['Resolution'] }))).toBe('7');
  expect(valueText(opt({ id: 'block', value: '' }))).toBe('–');
  expect(valueText(opt({ id: 'max_size', value: 2.5 }))).toBe('2.5');
});

test('parses an edited number, keeps text as it is', () => {
  const num = opt({ id: 'max_size', value: 100, default: 100 });
  expect(parseValue(num, ' 12,5 ')).toBe(12.5);
  expect(parseValue(num, '')).toBe(null);
  expect(parseValue(num, 'abc')).toBe(null);
  expect(parseValue(opt({ id: 'block', default: '' }), ' cam ')).toBe(' cam ');
});

test('tells secrets: masked values and token or password options', () => {
  expect(isSecret(opt({ id: 'cookie_sync_password' }))).toBe(true);
  expect(isSecret(opt({ id: 'x', value: '********' }))).toBe(true);
  expect(isSecret(opt({ id: 'cookie_sync_filename', value: 'a.json' }))).toBe(false);
});

test('reads a text option', () => {
  const l = [opt({ id: 'cookie_sync_user', value: 'octo' }), opt({ id: 'n', value: 3 })];
  expect(optionText(l, 'cookie_sync_user')).toBe('octo');
  expect(optionText(l, 'n')).toBe('');
  expect(optionText(l, 'missing')).toBe('');
});

test('provider lines: languages, account or missing login, and why it is not searched', () => {
  expect(providerLine(prov({ id: 'yts', languages: ['en', 'ru'] }), 'no login yet')).toBe('en, ru');
  expect(providerLine(prov({ id: 'p', private: true, searched: false, reason: 'no username' }), 'no login yet')).toBe('en · no login yet');
  expect(providerLine(prov({ id: 'p', private: true, username: 'me', has_secret: true }), 'no login yet')).toBe('en · me');
  expect(providerLine(prov({ id: 'p', private: true, has_secret: true }), 'no login yet')).toBe('en');
  expect(providerLine(prov({ id: 'x', searched: false, reason: 'blocked' }), '-')).toBe('en · blocked');
  expect(providerLine(prov({ id: 'x', enabled: false, searched: false, reason: 'off' }), '-')).toBe('en');
});

test('lists providers of one kind by name, and the enabled ones', () => {
  const all = [prov({ id: 'b', name: 'beta' }), prov({ id: 'a', name: 'Alpha', enabled: false }), prov({ id: 'p', name: 'Priv', private: true })];
  expect(providersOf(all, false).map((p) => p.id)).toEqual(['a', 'b']);
  expect(enabledNames(all, false)).toBe('beta');
  expect(enabledNames(all, true)).toBe('Priv');
});
