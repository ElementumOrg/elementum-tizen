import { afterEach, expect, test, vi } from 'vitest';

const { values, entries } = Object;
afterEach(() => {
  Object.values = values;
  Object.entries = entries;
});

test('polyfills fill in Object.values/entries when missing (Chromium 53)', async () => {
  // @ts-expect-error simulate an engine without them
  delete Object.values;
  // @ts-expect-error simulate an engine without them
  delete Object.entries;
  vi.resetModules();
  await import('../src/polyfills');
  expect(Object.values({ a: 1, b: 2 })).toEqual([1, 2]);
  expect(Object.entries({ a: 1 })).toEqual([['a', 1]]);
});
