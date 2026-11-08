import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createLongPress } from '../src/nav/longpress';
import { enter, trackEnter } from '../src/nav/keys';
import { badgesOf, firstUnwatched, progressOf, resumeFraction } from '../src/ui/item-state';
import { orderSeasons } from '../src/screens/meta';
import { menuOps, runOp } from '../src/ui/ItemMenu';
import { getOverride, setOverride, effectiveOverride } from '../src/ui/item-state';
import { ApiError } from '../src/api/client';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function press() {
  const log: string[] = [];
  const p = createLongPress(() => log.push('short'), () => log.push('long'));
  return { p, log };
}
const wait = (ms: number) => vi.advanceTimersByTime(ms);

test('quick tap: short on key-up', () => {
  const { p, log } = press();
  p.press();
  wait(80);
  p.release();
  expect(log).toEqual(['short']);
});

test('TV pattern: one key-down, 700 ms, one key-up (no repeats): long at 600 ms, key-up selects nothing', () => {
  const { p, log } = press();
  p.press();
  wait(599);
  expect(log).toEqual([]);
  wait(1);
  expect(log).toEqual(['long']);
  wait(100);
  p.release();
  wait(1000);
  expect(log).toEqual(['long']);
  p.press(); // a new press works afterwards
  p.release();
  expect(log).toEqual(['long', 'short']);
});

test('hold with repeats and a key-up at the end: long once', () => {
  const { p, log } = press();
  for (let t = 0; t < 1200; t += 100) (p.press(), wait(100));
  expect(log).toEqual(['long']);
  p.release();
  wait(1000);
  expect(log).toEqual(['long']);
});

test('TV: long press whose key-up was lost: long once, and a press 3 s later is fresh', () => {
  const { p, log } = press();
  p.press();
  wait(700);
  expect(log).toEqual(['long']);
  wait(3000);
  p.press();
  p.release();
  expect(log).toEqual(['long', 'short']);
});

test('a release without a press is ignored', () => {
  const { p, log } = press();
  p.release();
  wait(1000);
  expect(log).toEqual([]);
});

test('trackEnter: held flag and fresh presses', () => {
  trackEnter('keydown', 13, false, 1000);
  expect(enter).toMatchObject({ held: true, fresh: true });
  trackEnter('keydown', 13, true, 1100); // repeat
  expect(enter.fresh).toBe(false);
  trackEnter('keydown', 13, false, 1200); // no repeat flag, but 100 ms after the last
  expect(enter.fresh).toBe(false);
  trackEnter('keyup', 13, false, 1300);
  expect(enter.held).toBe(false);
  trackEnter('keydown', 13, false, 1700);
  expect(enter.fresh).toBe(true);
  trackEnter('keydown', 38, false, 5000); // other keys are ignored
  expect(enter.last).toBe(1700);
});

test('badges: only true flags show, unknown shows nothing', () => {
  expect(badgesOf({})).toEqual([]);
  expect(badgesOf({ in_library: null, watched: false, in_collection: false })).toEqual([]);
  expect(badgesOf({ watched: true, in_library: true, in_collection: true, in_watchlist: true })).toEqual(['watched', 'library', 'collection', 'watchlist']);
  expect(badgesOf({ in_watchlist: true })).toEqual(['watchlist']);
});

test('progress bar only between 0 and 1', () => {
  expect([null, undefined, 0, 1, 1.2].map(progressOf)).toEqual([0, 0, 0, 0, 0]);
  expect(progressOf(0.4)).toBe(0.4);
  expect(resumeFraction(1800, 60)).toBe(0.5);
  expect(resumeFraction(null, 60)).toBeNull();
  expect(resumeFraction(100, null)).toBeNull();
  expect(resumeFraction(9999, 60)).toBe(1);
});

const w = (...v: Array<boolean | null | undefined>) => v.map((watched) => ({ watched }));

test('first unwatched: episodes', () => {
  expect(firstUnwatched(w(true, true, false, true), 0)).toBe(2);
  expect(firstUnwatched(w(false, false), 0)).toBe(0);
  expect(firstUnwatched(w(true, true), 0)).toBe(0); // all watched: the fallback
  expect(firstUnwatched(w(null, null), 0)).toBe(0); // no tracker: the start
  expect(firstUnwatched(w(true, null), 0)).toBe(1);
  expect(firstUnwatched([], 0)).toBe(0);
});

test('first unwatched: seasons, specials never picked', () => {
  const s = (n: number, watched: boolean | null) => ({ season_number: n, name: '', episode_count: 1, air_date: null, poster: null, watched });
  const pick = (list: ReturnType<typeof s>[]) => {
    const regular = orderSeasons(list).filter((x) => x.season_number > 0);
    return Math.max(0, firstUnwatched(regular, regular.length - 1));
  };
  expect(pick([s(0, false), s(1, true), s(2, false)])).toBe(1); // season 2
  expect(pick([s(0, false), s(1, true), s(2, true)])).toBe(1); // all regular watched: the last regular season
  expect(pick([s(0, true), s(1, null), s(2, null)])).toBe(0); // unknown: the first
  expect(pick([s(0, false)])).toBe(0);
});

test('menu entries follow the state', () => {
  expect(menuOps({ kind: 'movie', tmdb_id: 1 }, {}, false)).toEqual(['library_add']); // no tracker: no watched
  expect(menuOps({ kind: 'episode', tmdb_id: 1, season: 1, episode: 1 }, {}, false)).toEqual([]);
  const m = { kind: 'movie' as const, tmdb_id: 1 };
  expect(menuOps(m, {})).toEqual(['library_add', 'watched']);
  expect(menuOps(m, { in_library: true, watched: true })).toEqual(['library_remove', 'unwatched']);
  expect(menuOps({ kind: 'episode', tmdb_id: 1, season: 1, episode: 1 }, { watched: true })).toEqual(['unwatched']);
  expect(menuOps({ kind: 'season', tmdb_id: 1, season: 1 }, { in_library: true })).toEqual(['watched']);
});

vi.mock('../src/api/client', async (orig) => {
  const real = await orig<typeof import('../src/api/client')>();
  return { ...real, post: vi.fn(), del: vi.fn() };
});

test('failed library change: the override goes back to nothing, not undefined', async () => {
  const c = await import('../src/api/client');
  (c.del as any).mockRejectedValueOnce(new ApiError('api', 500, 'boom'));
  const r = { kind: 'movie' as const, tmdb_id: 11 };
  await runOp(r, 'library_remove');
  expect(getOverride(r)).toEqual({}); // the key was removed, nothing writes undefined over the base
  expect('in_library' in getOverride(r)!).toBe(false);
  expect(effectiveOverride(r, { in_library: true })).toBeUndefined();
});

test('failed watched change restores the earlier override, incl. the season count', async () => {
  const c = await import('../src/api/client');
  const r = { kind: 'season' as const, tmdb_id: 12, season: 2, total: 10 };
  setOverride(r, { watched: false, watched_episodes: 3 }); // what the user saw
  (c.post as any).mockRejectedValueOnce(new ApiError('api', 409, 'tracker_not_authorized'));
  await runOp(r, 'watched');
  expect(getOverride(r)).toEqual({ watched: false, watched_episodes: 3 });
  // and one with no earlier override: both keys are removed
  const r2 = { kind: 'season' as const, tmdb_id: 13, season: 1, total: 8 };
  (c.post as any).mockRejectedValueOnce(new ApiError('network', 0, 'timeout'));
  await runOp(r2, 'watched');
  expect(Object.keys(getOverride(r2)!)).toEqual([]);
});

test('successful op keeps the override until the server data catches up', async () => {
  const c = await import('../src/api/client');
  (c.post as any).mockResolvedValueOnce(undefined);
  const r = { kind: 'movie' as const, tmdb_id: 14 };
  await runOp(r, 'library_add');
  expect(effectiveOverride(r, { in_library: false })).toEqual({ in_library: true });
  expect(effectiveOverride(r, { in_library: true })).toBeUndefined(); // server agrees: dropped
});
