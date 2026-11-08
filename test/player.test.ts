import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createHider, createReporter, createSeeker, formatTime, playerCmd, startAt } from '../src/player/util';
import { create } from '../src/player';
import { createStack } from '../src/nav/stack';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test('formatTime', () => {
  expect(formatTime(0)).toBe('0:00');
  expect(formatTime(83.9)).toBe('1:23');
  expect(formatTime(3725)).toBe('1:02:05');
  expect(formatTime(NaN)).toBe('0:00');
});

test('startAt resumes only past 30 s', () => {
  expect([startAt(null), startAt(30), startAt(31), startAt(900)]).toEqual([0, 0, 31, 900]);
});

test('key mapping', () => {
  expect(playerCmd('left')).toEqual({ type: 'seek', by: -10 });
  expect(playerCmd('right')).toEqual({ type: 'seek', by: 10 });
  expect(playerCmd('ff')).toEqual({ type: 'seek', by: 60 });
  expect(playerCmd('rw')).toEqual({ type: 'seek', by: -60 });
  expect(playerCmd('up')).toEqual({ type: 'tracks' });
  expect(playerCmd('enter')).toEqual({ type: 'toggle' });
  expect(playerCmd('stop')).toEqual({ type: 'exit' });
  expect(playerCmd('back')).toEqual({ type: 'exit' });
  expect(playerCmd('red')).toBeUndefined();
});

test('OSD hides after 4 s without input; poke restarts, cancel stops', () => {
  const hide = vi.fn();
  const h = createHider(hide);
  h.poke();
  vi.advanceTimersByTime(3900);
  h.poke();
  vi.advanceTimersByTime(3900);
  expect(hide).not.toHaveBeenCalled();
  vi.advanceTimersByTime(100);
  expect(hide).toHaveBeenCalledTimes(1);
  h.poke();
  h.cancel();
  vi.advanceTimersByTime(10000);
  expect(hide).toHaveBeenCalledTimes(1);
});

test('reporter: immediate start, 10 s cadence, now(), final, then silent', async () => {
  const send = vi.fn(() => Promise.resolve());
  let paused = false;
  const r = createReporter(() => ({ position_s: 5, duration_s: 100, paused }), send, () => {});
  r.start();
  expect(send).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(10000);
  expect(send).toHaveBeenCalledTimes(2);
  paused = true;
  r.now();
  expect(send).toHaveBeenLastCalledWith({ position_s: 5, duration_s: 100, paused: true });
  expect(send).toHaveBeenCalledTimes(3);
  await r.finish();
  expect(send).toHaveBeenCalledTimes(4);
  vi.advanceTimersByTime(60000);
  r.now();
  expect(send).toHaveBeenCalledTimes(4);
});

test('reporter warns after 3 consecutive failures and clears on success', async () => {
  let ok = false;
  const warn = vi.fn();
  const r = createReporter(() => ({ position_s: 0, duration_s: 0, paused: false }), () => (ok ? Promise.resolve() : Promise.reject(new Error('x'))), warn);
  await r.now();
  await r.now();
  expect(warn).not.toHaveBeenCalled();
  await r.now();
  expect(warn).toHaveBeenLastCalledWith(true);
  ok = true;
  await r.now();
  expect(warn).toHaveBeenLastCalledWith(false);
});

test('create() picks AVPlay only when webapis.avplay exists', () => {
  vi.stubGlobal('document', { createElement: (t: string) => ({ tagName: t, setAttribute() {}, addEventListener() {} }), addEventListener() {} });
  const mk = (w: object) => {
    vi.stubGlobal('window', w);
    const h = { appendChild: vi.fn(), classList: { add() {} } } as unknown as HTMLElement;
    create(h);
    return ((h.appendChild as any).mock.calls[0][0] as { tagName: string }).tagName;
  };
  expect(mk({})).toBe('video');
  expect(mk({ webapis: {} })).toBe('video');
  expect(mk({ webapis: { avplay: {} } })).toBe('object');
});

test('removeWithBelow drops the layer and the one under it, wherever they are', () => {
  const s = createStack({ get: () => 'f', set: () => {} });
  ['details', 'streams', 'player', 'other'].forEach((v) => s.push(() => v));
  let renders = 0;
  s.subscribe(() => renders++);
  expect(s.removeWithBelow(s.entries[2].id, 1)).toBe(true);
  expect(s.entries.map((e) => e.view())).toEqual(['details', 'other']);
  expect(renders).toBe(1);
  expect(s.removeWithBelow(999, 1)).toBe(false);
  expect(s.removeWithBelow(s.entries[1].id, 5)).toBe(true); // never removes the root
  expect(s.entries.map((e) => e.view())).toEqual(['details']);
});

test('seeker accumulates rapid keys into one clamped seek after 300 ms', () => {
  let pos = 100;
  const apply = vi.fn();
  const seen: Array<number | null> = [];
  const k = createSeeker(() => pos, () => 125, apply, (p) => seen.push(p));
  k.by(10);
  vi.advanceTimersByTime(200);
  k.by(10);
  vi.advanceTimersByTime(299);
  expect(apply).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(apply).toHaveBeenCalledTimes(1);
  expect(apply.mock.calls[0][0]).toBe(120);
  k.by(10); // pending still set until the seek completes: continues from 120, clamped to the duration
  expect(k.pending()).toBe(125);
  apply.mock.calls[0][1]();
  expect(seen[seen.length - 1]).toBeNull();
  k.by(-200);
  expect(k.pending()).toBe(0);
  k.cancel();
});

import { columnIndices, nextTrack, panelKey, panelMove } from '../src/player/tracks';
import type { Player, Track } from '../src/player';

const A: Track[] = [{ index: 0, label: 'en', current: true }, { index: 1, label: 'ru', current: false }];
const S: Track[] = [{ index: 0, label: 'en', current: false }, { index: 1, label: 'ru', current: false }];

test('key mapping: green/yellow cycle tracks', () => {
  expect(playerCmd('green')).toEqual({ type: 'audio' });
  expect(playerCmd('yellow')).toEqual({ type: 'subs' });
});

test('panel cursor moves within bounds and between columns', () => {
  const rows: [number, number] = [2, 3];
  expect(panelMove({ col: 0, row: 0 }, 'up', rows)).toEqual({ col: 0, row: 0 });
  expect(panelMove({ col: 0, row: 1 }, 'down', rows)).toEqual({ col: 0, row: 1 });
  expect(panelMove({ col: 0, row: 1 }, 'right', rows)).toEqual({ col: 1, row: 1 });
  expect(panelMove({ col: 1, row: 2 }, 'left', rows)).toEqual({ col: 0, row: 1 });
  expect(columnIndices('text', S)).toEqual([-1, 0, 1]);
  expect(columnIndices('audio', A)).toEqual([0, 1]);
});

test('cycling audio wraps, subtitles pass through Off', () => {
  expect(nextTrack('audio', A)).toBe(1);
  expect(nextTrack('audio', [{ index: 0, label: 'a', current: false }, { index: 1, label: 'b', current: true }])).toBe(0);
  expect(nextTrack('text', S)).toBe(0); // Off -> first
  expect(nextTrack('text', [S[0], { ...S[1], current: true }])).toBe(-1); // last -> Off
  expect(nextTrack('audio', [A[0]])).toBeUndefined();
});

test('panel keys: Enter picks, Back closes, transport keys pass through, the rest is swallowed', () => {
  const c = { col: 1 as const, row: 0 };
  expect(panelKey(c, 'enter', A, S)).toEqual({ cursor: c, pick: ['text', -1], handled: true });
  expect(panelKey({ col: 0, row: 1 }, 'enter', A, S).pick).toEqual(['audio', 1]);
  expect(panelKey(c, 'back', A, S).close).toBe(true);
  for (const a of ['stop', 'playpause', 'play', 'pause'] as const) expect(panelKey(c, a, A, S).handled).toBe(false);
  for (const a of ['red', 'green', 'yellow', 'ff'] as const) expect(panelKey(c, a, A, S)).toEqual({ cursor: c, handled: true });
  expect(panelKey({ col: 0, row: 0 }, 'right', A, S).cursor).toEqual({ col: 1, row: 0 }); // no subtitle current: Off
});
