import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createWaiter } from '../src/api/waiter';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const net = { network: true };
const isNet = (e: unknown) => e === net;
/** A probe that answers with the queued results ('ok' resolves), then keeps failing with a network error. */
function probeOf(results: unknown[]) {
  return vi.fn(() => {
    const r = results.length ? results.shift() : net;
    return r === 'ok' ? Promise.resolve(r) : Promise.reject(r);
  });
}

test('a blip: the immediate probe succeeds, so no dialog and done = false', async () => {
  const probe = probeOf(['ok']);
  let changes = 0;
  const w = createWaiter(probe, isNet, () => changes++);
  const h = w.wait();
  expect(probe).toHaveBeenCalledTimes(1);
  expect(await h.done).toBe(false);
  expect(changes).toBe(0);
  expect(w.waiting).toBe(false);
});

test('server down: dialog after the first failed probe, probes every 3 s, shared by callers, done = true', async () => {
  const probe = probeOf([net, net, 'ok']);
  let changes = 0;
  const w = createWaiter(probe, isNet, () => changes++);
  const a = w.wait();
  const b = w.wait();
  await vi.advanceTimersByTimeAsync(0);
  expect(probe).toHaveBeenCalledTimes(1);
  expect(w.waiting).toBe(true);
  expect(changes).toBe(1);
  await vi.advanceTimersByTimeAsync(2999);
  expect(probe).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(probe).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(3000);
  expect(await a.done).toBe(true);
  expect(await b.done).toBe(true);
  expect(probe).toHaveBeenCalledTimes(3);
  expect(w.waiting).toBe(false);
  expect(changes).toBe(2);
  await vi.advanceTimersByTimeAsync(10000);
  expect(probe).toHaveBeenCalledTimes(3);
});

test('any non-network answer (e.g. 401) ends the wait', async () => {
  const probe = probeOf([net, { kind: 'unauthorized' }]);
  const w = createWaiter(probe, isNet, () => {});
  const h = w.wait();
  await vi.advanceTimersByTimeAsync(3000);
  expect(await h.done).toBe(true);
  expect(probe).toHaveBeenCalledTimes(2);
});

test('when every caller leaves, the dialog closes and probing stops', async () => {
  const probe = probeOf([]);
  let changes = 0;
  const w = createWaiter(probe, isNet, () => changes++);
  const a = w.wait();
  const b = w.wait();
  await vi.advanceTimersByTimeAsync(0);
  expect(w.waiting).toBe(true);
  a.leave();
  a.leave(); // twice is harmless
  expect(w.waiting).toBe(true);
  b.leave();
  expect(w.waiting).toBe(false);
  expect(changes).toBe(2);
  await vi.advanceTimersByTimeAsync(10000);
  expect(probe).toHaveBeenCalledTimes(1);
});

test('no probes while paused (app hidden); one at once when visible again', async () => {
  const probe = probeOf([net, net, 'ok']);
  const w = createWaiter(probe, isNet, () => {});
  const h = w.wait();
  await vi.advanceTimersByTimeAsync(0);
  w.setPaused(true);
  await vi.advanceTimersByTimeAsync(3000); // the pending delay ends, then it parks
  const n = probe.mock.calls.length;
  await vi.advanceTimersByTimeAsync(30000);
  expect(probe).toHaveBeenCalledTimes(n);
  w.setPaused(false);
  await vi.advanceTimersByTimeAsync(0);
  expect(probe).toHaveBeenCalledTimes(n + 1);
  await vi.advanceTimersByTimeAsync(3000);
  expect(await h.done).toBe(true);
});
