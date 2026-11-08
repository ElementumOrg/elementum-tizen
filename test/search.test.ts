import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { debounce } from '../src/ui/debounce';
import { addRecent, loadRecent } from '../src/settings';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test('debounce: only the last call runs, after the delay', () => {
  const fn = vi.fn();
  const d = debounce(fn, 600);
  d.call('ma');
  vi.advanceTimersByTime(500);
  d.call('mat');
  vi.advanceTimersByTime(500);
  expect(fn).not.toHaveBeenCalled();
  vi.advanceTimersByTime(100);
  expect(fn.mock.calls).toEqual([['mat']]);
});

test('debounce: cancel drops the pending call', () => {
  const fn = vi.fn();
  const d = debounce(fn, 600);
  d.call('b');
  d.cancel();
  vi.advanceTimersByTime(1000);
  expect(fn).not.toHaveBeenCalled();
});

test('recent searches: most recent first, deduped, capped at 10', () => {
  let l: string[] = [];
  for (const q of ['a1', 'b1', 'c1']) l = addRecent(l, q);
  expect(l).toEqual(['c1', 'b1', 'a1']);
  expect(addRecent(l, 'A1')).toEqual(['A1', 'c1', 'b1']);
  for (let i = 0; i < 12; i++) l = addRecent(l, 'q' + i);
  expect(l).toHaveLength(10);
  expect(l[0]).toBe('q11');
});

test('loadRecent ignores garbage', () => {
  const store: Record<string, string> = {};
  vi.stubGlobal('localStorage', { getItem: (k: string) => store[k] ?? null });
  store['elementum.recent'] = '{"a":1}';
  expect(loadRecent()).toEqual([]);
  store['elementum.recent'] = '["ok",5,null,"two"]';
  expect(loadRecent()).toEqual(['ok', 'two']);
  store['elementum.recent'] = 'not json';
  expect(loadRecent()).toEqual([]);
  vi.unstubAllGlobals();
});
