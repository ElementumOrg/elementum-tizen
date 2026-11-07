interface Run {
  done: Promise<boolean>;
  users: number;
  /** A probe failed: the server is really down and the dialog shows. */
  down: boolean;
  over: boolean;
}

/**
 * Waits for the server after a network error. It probes at once, then every `delayMs`, until a probe gets
 * any answer that isn't a network error (a 401 counts: the server is up). Concurrent callers share one run.
 * `done` resolves to whether the server was down, so callers resend only then. While paused (app hidden)
 * it doesn't probe; when every caller has left (aborted), the run stops.
 */
export function createWaiter(
  probe: () => Promise<unknown>,
  isNetworkError: (e: unknown) => boolean,
  onChange: () => void,
  delayMs = 3000,
) {
  let run: Run | null = null;
  let paused = false;
  let wake = () => {};

  const finish = (r: Run) => {
    if (run !== r) return;
    run = null;
    if (r.down) onChange();
  };

  async function loop(r: Run) {
    for (;;) {
      try {
        await probe();
        return;
      } catch (e) {
        if (!isNetworkError(e)) return;
      }
      if (r.over) return;
      if (!r.down) {
        r.down = true;
        onChange();
      }
      await new Promise<void>((res) => {
        const timer = setTimeout(res, delayMs);
        wake = () => (clearTimeout(timer), res());
      });
      while (paused && !r.over) await new Promise<void>((res) => (wake = res));
      if (r.over) return;
    }
  }

  return {
    /** The dialog shows: a probe failed and the run isn't over. */
    get waiting() {
      return run !== null && run.down;
    },
    wait() {
      if (!run) {
        const r: Run = { done: Promise.resolve(false), users: 0, down: false, over: false };
        run = r;
        r.done = loop(r).then(() => (finish(r), r.down));
      }
      const r = run;
      r.users++;
      let left = false;
      return {
        done: r.done,
        leave() {
          if (left) return;
          left = true;
          if (--r.users === 0 && !r.over) {
            r.over = true;
            wake();
            finish(r);
          }
        },
      };
    },
    /** Hidden app: stop probing; visible again: probe at once. */
    setPaused(p: boolean) {
      paused = p;
      if (!p) wake();
    },
  };
}
