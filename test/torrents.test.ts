import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { enter, onFreshEnter, trackEnter } from '../src/nav/keys';
import { neighbour, applyOverlay, pruneOverlay, createPoller, formatBytes, removeActions, stateLabel, statsLine, type Torrent } from '../src/screens/torrents-util';

const tor = (p: Partial<Torrent> = {}): Torrent => ({
  info_hash: 'a', name: 'Sintel', size_bytes: 129302391, progress: 0.5, download_rate: 3.5 * 1024 * 1024, upload_rate: 100 * 1024,
  seeds: 12, peers: 80, state: 'downloading', paused: false, added_at: 1, has_player: false, ...p,
});

test('formatBytes', () => {
  expect(formatBytes(0)).toBe('0 B');
  expect(formatBytes(1536)).toBe('1.5 KB');
  expect(formatBytes(129302391)).toBe('123 MB');
  expect(formatBytes(5 * 1024 ** 3)).toBe('5.0 GB');
});

test('row text: state label and stats line', () => {
  expect(stateLabel(tor())).toBe('Downloading 50%');
  expect(stateLabel(tor({ state: 'seeding' }))).toBe('Seeding');
  expect(stateLabel(tor({ paused: true, state: 'downloading' }))).toBe('Paused');
  expect(statsLine(tor())).toBe('123 MB · ↓ 3.5 MB/s · ↑ 100 KB/s · 12/80');
  expect(statsLine(tor({ size_bytes: 0 }))).toMatch(/^\? · /);
});

test('overlay changes or hides a torrent until dropped', () => {
  const list = [tor({ info_hash: 'a' }), tor({ info_hash: 'b' })];
  expect(applyOverlay(list, { a: null }).map((x) => x.info_hash)).toEqual(['b']);
  expect(applyOverlay(list, { b: { paused: true } })[1].paused).toBe(true);
  expect(applyOverlay(list, {})).toEqual(list);
});

test('remove dialog: each choice reports the delete_files value', () => {
  const chosen: boolean[] = [];
  let cancelled = 0;
  const [keep, del, cancel] = removeActions((f) => chosen.push(f), () => cancelled++);
  del.onPress();
  keep.onPress();
  cancel.onPress();
  expect(chosen).toEqual([true, false]);
  expect(cancelled).toBe(1);
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test('poller: runs at once, then 3 s after each run settles', async () => {
  const run = vi.fn(() => Promise.resolve());
  const p = createPoller(run);
  p.start();
  expect(run).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(2900);
  expect(run).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(200);
  expect(run).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(3000);
  expect(run).toHaveBeenCalledTimes(3);
  p.stop();
});

test('poller: stop cancels the timer; a run settling after stop schedules nothing', async () => {
  let done!: () => void;
  const run = vi.fn(() => new Promise<void>((r) => (done = r)));
  const p = createPoller(run);
  p.start();
  p.stop();
  done();
  await vi.advanceTimersByTimeAsync(10000);
  expect(run).toHaveBeenCalledTimes(1);
  p.start();
  expect(run).toHaveBeenCalledTimes(2);
  p.stop();
  await vi.advanceTimersByTimeAsync(10000);
  expect(run).toHaveBeenCalledTimes(2);
});

test('poller: one in flight, even when started again; failures keep polling', async () => {
  let n = 0;
  let fail!: () => void;
  const run = vi.fn(() => new Promise<void>((_, rej) => (n++, (fail = () => rej(new Error('x'))))));
  const p = createPoller(run);
  p.start();
  p.start();
  await vi.advanceTimersByTimeAsync(10000);
  expect(n).toBe(1);
  fail();
  await vi.advanceTimersByTimeAsync(3100);
  expect(n).toBe(2);
  p.stop();
});

test('overlay is pruned once the server agrees', () => {
  const list = [tor({ info_hash: 'a', paused: true }), tor({ info_hash: 'b', paused: false })];
  const o = { a: { paused: true }, b: { paused: true }, c: null, d: null };
  expect(pruneOverlay(list, o)).toEqual({ b: { paused: true } });
  expect(pruneOverlay([tor({ info_hash: 'd' })], { d: null })).toEqual({ d: null });
});

test('neighbour: next surviving row, else previous, else null', () => {
  expect(neighbour(['a', 'b', 'c'], ['a', 'c'])).toBe('c');
  expect(neighbour(['a', 'b', 'c'], ['a', 'b'])).toBe('b');
  expect(neighbour(['a'], [])).toBeNull();
});

test('OK actions ignore repeats and quick second presses', () => {
  let n = 0;
  const press = onFreshEnter(() => n++);
  trackEnter('keydown', 13, false, 10000); // the press that opened the dialog is long past
  press();
  expect(n).toBe(1);
  trackEnter('keydown', 13, true, 10100); // key repeat
  press();
  trackEnter('keydown', 13, false, 10200); // too soon after the last down
  press();
  expect(n).toBe(1);
  trackEnter('keyup', 13, false, 10250);
  expect(enter.held).toBe(false);
});
