import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { formatRate, formatSize, playerSession, startPoller, streamBadges, type Session, type Stream } from '../src/screens/streams-util';

const sess = (id: string, state: Session['state']): Session => ({ id, state, buffer_progress: 0, download_rate: 0, seeds: 0, peers: 0, resume_s: null });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test('formatSize / formatRate', () => {
  expect(formatSize(700 * 1048576)).toBe('700 MB');
  expect(formatSize(1.5 * 1073741824)).toBe('1.50 GB');
  expect(formatRate(300 * 1024)).toBe('300 KB/s');
  expect(formatRate(2.5 * 1048576)).toBe('2.5 MB/s');
});

test('streamBadges skips missing fields', () => {
  const s = { resolution: '1080p', rip: null, codec: 'H.265', audio: null, language: 'en', size_bytes: 1073741824 } as Stream;
  expect(streamBadges(s)).toEqual(['1080p', 'H.265', 'en', '1.00 GB']);
  expect(streamBadges({ ...s, resolution: null, codec: null, language: null, size_bytes: null })).toEqual([]);
});

test('poller is sequential and stops on ready', async () => {
  let inflight = 0;
  let maxInflight = 0;
  const seen: string[] = [];
  const states: Session['state'][] = [];
  const fetchS = vi.fn(async (id: string) => {
    inflight++;
    maxInflight = Math.max(maxInflight, inflight);
    seen.push(id);
    await Promise.resolve();
    inflight--;
    return sess(id, seen.length >= 5 ? 'ready' : 'buffering');
  });
  startPoller('a', fetchS, (s) => void states.push(s.state), () => {});
  await vi.advanceTimersByTimeAsync(2500);
  expect(seen).toEqual(['a', 'a', 'a']); // t=0, 1000, 2000
  await vi.advanceTimersByTimeAsync(5000);
  expect(seen.length).toBe(5); // fifth answer is ready -> stops
  expect(states[states.length - 1]).toBe('ready');
  expect(maxInflight).toBe(1);
});

test('poller: slow response is not overlapped; stop() silences callbacks', async () => {
  let resolve: (s: Session) => void = () => {};
  const fetchS = vi.fn(() => new Promise<Session>((r) => (resolve = r)));
  const got = vi.fn();
  const p = startPoller('a', fetchS, got, () => {});
  await vi.advanceTimersByTimeAsync(5000);
  expect(fetchS).toHaveBeenCalledTimes(1);
  p.stop();
  resolve(sess('a', 'buffering'));
  await vi.advanceTimersByTimeAsync(5000);
  expect(got).not.toHaveBeenCalled();
  expect(fetchS).toHaveBeenCalledTimes(1);
});

test('poller stops on error state and reports after 3 failures', async () => {
  const f1 = vi.fn(async (id: string) => sess(id, 'error'));
  startPoller('a', f1, () => {}, () => {});
  await vi.advanceTimersByTimeAsync(5000);
  expect(f1).toHaveBeenCalledTimes(1);
  const f2 = vi.fn(async () => { throw new Error('x'); });
  const onErr = vi.fn();
  startPoller('a', f2, () => {}, onErr);
  await vi.advanceTimersByTimeAsync(5000);
  expect(f2).toHaveBeenCalledTimes(3);
  expect(onErr).toHaveBeenCalledTimes(1);
});

test('after a file choice the old poller is silent even if its in-flight answer is `stopped`', async () => {
  let answerOld: (s: Session) => void = () => {};
  const old = vi.fn();
  const fresh = vi.fn();
  const a = startPoller('a', () => new Promise<Session>((r) => (answerOld = r)), old, () => {});
  a.stop(); // choose(): stop before the re-POST
  const b = startPoller('b', async (id) => sess(id, 'buffering'), fresh, () => {});
  answerOld(sess('a', 'stopped'));
  await vi.advanceTimersByTimeAsync(1500);
  expect(old).not.toHaveBeenCalled();
  expect(fresh).toHaveBeenCalledTimes(2);
  b.stop();
});

test('onSession returning false keeps polling past ready', async () => {
  let ok = false;
  const f = vi.fn(async (id: string) => sess(id, 'ready'));
  startPoller('a', f, () => (ok ? undefined : false), () => {});
  await vi.advanceTimersByTimeAsync(2500);
  expect(f).toHaveBeenCalledTimes(3);
  ok = true;
  await vi.advanceTimersByTimeAsync(1000);
  await vi.advanceTimersByTimeAsync(3000);
  expect(f).toHaveBeenCalledTimes(4);
});

test('playerSession passes the plain title and the item info', () => {
  const s = { id: 'x', stream_url: 'u', resume_s: 5 };
  expect(playerSession(s, { title: 'Show', subtitle: 'S1E2 · Pilot', year: 2026, overview: 'o', poster: 'p', backdrops: ['b1', 'b2'] })).toEqual({
    id: 'x', stream_url: 'u', resume_s: 5, title: 'Show', subtitle: 'S1E2 · Pilot', year: 2026, overview: 'o', poster: 'p', backdrop: 'b1',
  });
  expect(playerSession(s, { title: 'T' }).backdrop).toBeUndefined();
});
