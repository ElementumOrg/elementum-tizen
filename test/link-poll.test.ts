import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { watchLogin } from '../src/ui/link-poll';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const make = (answers: number[], interval = 1, start = 0) => {
  const log = { checks: 0, linked: 0, expired: 0, left: 0, aborted: 0 };
  const stop = watchLogin({
    expiresIn: 30,
    interval,
    logins: start,
    check: () => {
      const ok = answers[log.checks++] ?? start;
      return Object.assign(Promise.resolve(ok), { abort: () => void log.aborted++ });
    },
    onTick: (n) => void (log.left = n),
    onLinked: () => void log.linked++,
    onExpired: () => void log.expired++,
  });
  return { log, stop };
};

it('polls no faster than every 5 s and finishes when linked', async () => {
  const { log } = make([0, 1]);
  await vi.advanceTimersByTimeAsync(4900);
  expect(log.checks).toBe(0);
  await vi.advanceTimersByTimeAsync(5100);
  expect(log.checks).toBe(2);
  expect(log.linked).toBe(1);
  await vi.advanceTimersByTimeAsync(20000);
  expect(log.checks).toBe(2); // stopped
  expect(log.expired).toBe(0);
});

it('re-link: finishes when logins grows past the start, even if already authorized', async () => {
  const { log } = make([5, 5, 6], 1, 5);
  await vi.advanceTimersByTimeAsync(15100);
  expect(log.checks).toBe(3);
  expect(log.linked).toBe(1);
});

it('counts down and expires once', async () => {
  const { log } = make([]);
  await vi.advanceTimersByTimeAsync(10000);
  expect(log.left).toBe(20);
  await vi.advanceTimersByTimeAsync(30000);
  expect(log.expired).toBe(1);
  expect(log.linked).toBe(0);
});

it('uses a longer server interval; stop() ends everything', async () => {
  const { log, stop } = make([], 8);
  await vi.advanceTimersByTimeAsync(7900);
  expect(log.checks).toBe(0);
  await vi.advanceTimersByTimeAsync(200);
  expect(log.checks).toBe(1);
  stop();
  await vi.advanceTimersByTimeAsync(60000);
  expect(log.checks).toBe(1);
  expect(log.expired).toBe(0);
});

it('a check that never settles blocks the next one; stop() aborts it', async () => {
  let checks = 0, aborted = 0;
  const stop = watchLogin({
    expiresIn: 60, interval: 1, logins: 0,
    check: () => (checks++, Object.assign(new Promise<number>(() => {}), { abort: () => void aborted++ })),
    onTick: () => {}, onLinked: () => {}, onExpired: () => {},
  });
  await vi.advanceTimersByTimeAsync(10000);
  expect(checks).toBe(1);
  stop();
  expect(aborted).toBe(1);
});

it('a rejecting check is retried one interval later', async () => {
  let checks = 0;
  watchLogin({
    expiresIn: 60, interval: 1, logins: 0,
    check: () => (checks++, Object.assign(Promise.reject(new Error('x')), { abort: () => {} })),
    onTick: () => {}, onLinked: () => {}, onExpired: () => {},
  });
  await vi.advanceTimersByTimeAsync(5100);
  expect(checks).toBe(1);
  await vi.advanceTimersByTimeAsync(5000);
  expect(checks).toBe(2);
});
