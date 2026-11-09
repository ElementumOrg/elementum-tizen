/**
 * Waits for a device login: calls `onTick(secondsLeft)` every second, `check()` every max(interval, 5) s (it returns the tracker's `logins` count; done when it exceeds `logins`),
 * and `onExpired` after `expiresIn` s. Failed checks are ignored (the next one retries). Returns stop(), which also aborts a pending check.
 */
export function watchLogin(o: {
  expiresIn: number;
  interval: number;
  /** `logins` of the tracker when the login started. */
  logins: number;
  check: () => Promise<number> & { abort(): void };
  onTick: (left: number) => void;
  onLinked: () => void;
  onExpired: () => void;
}) {
  const end = Date.now() + o.expiresIn * 1000;
  let pending: { abort(): void } | null = null;
  let done = false;
  const stop = () => {
    done = true;
    clearInterval(tick);
    clearInterval(poll);
    if (pending) pending.abort();
  };
  const tick = setInterval(() => {
    const left = Math.ceil((end - Date.now()) / 1000);
    if (left <= 0) (stop(), o.onExpired());
    else o.onTick(left);
  }, 1000);
  const poll = setInterval(() => {
    if (pending) return;
    const req = (pending = o.check());
    req.then(
      (n) => {
        pending = null;
        if (n > o.logins && !done) (stop(), o.onLinked());
      },
      () => void (pending = null),
    );
  }, Math.max(o.interval, 5) * 1000);
  o.onTick(o.expiresIn);
  return stop;
}
