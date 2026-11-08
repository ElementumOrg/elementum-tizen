import type { Action } from '../nav/keys';

/** 83 -> "1:23", 3725 -> "1:02:05" */
export function formatTime(s: number): string {
  s = Math.max(0, Math.floor(s || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = ('0' + (s % 60)).slice(-2);
  return h ? `${h}:${('0' + m).slice(-2)}:${ss}` : `${m}:${ss}`;
}

/** Resume only when it is meaningful (> 30 s in). */
export const startAt = (resume: number | null) => (resume != null && resume > 30 ? resume : 0);

export type PlayerCmd =
  | { type: 'seek'; by: number }
  | { type: 'toggle' | 'play' | 'pause' | 'exit' | 'tracks' | 'hide' | 'audio' | 'subs' };

/** Left/Right +-10 s, FF/Rewind +-60 s, Up = tracks panel, Green/Yellow = next audio/subtitles, Down = hide OSD, Enter/play keys, Back/Stop exit. */
export function playerCmd(a: Action): PlayerCmd | undefined {
  switch (a) {
    case 'left': return { type: 'seek', by: -10 };
    case 'right': return { type: 'seek', by: 10 };
    case 'rw': return { type: 'seek', by: -60 };
    case 'ff': return { type: 'seek', by: 60 };
    case 'up': return { type: 'tracks' };
    case 'green': return { type: 'audio' };
    case 'yellow': return { type: 'subs' };
    case 'down': return { type: 'hide' };
    case 'enter': case 'playpause': return { type: 'toggle' };
    case 'play': return { type: 'play' };
    case 'pause': return { type: 'pause' };
    case 'back': case 'stop': return { type: 'exit' };
  }
}

/** Calls `hide` after `ms` without `poke()`; `cancel()` stops it (paused, menu open). */
export function createHider(hide: () => void, ms = 4000) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => clearTimeout(timer);
  return {
    poke(after = ms) {
      cancel();
      timer = setTimeout(hide, after);
    },
    cancel,
  };
}

export interface Progress {
  position_s: number;
  duration_s: number;
  paused: boolean;
}

/**
 * Posts progress every `every` ms (it doubles as the server keepalive), on demand via `now()`,
 * and once more in `finish()`; nothing is sent after that. `onWarn(true)` after 3 failures in a row.
 */
export function createReporter(read: () => Progress, send: (p: Progress) => Promise<unknown>, onWarn: (on: boolean) => void, every = 10000) {
  let timer: ReturnType<typeof setInterval> | undefined;
  let done = false;
  let fails = 0;
  const now = () => {
    if (done) return Promise.resolve();
    return send(read()).then(
      () => (fails = 0, onWarn(false)),
      () => void (++fails >= 3 && onWarn(true)),
    );
  };
  return {
    start() {
      now();
      timer = setInterval(now, every);
    },
    now,
    /** Final progress; resolves when it is delivered (or failed). */
    finish() {
      const r = now();
      done = true;
      clearInterval(timer);
      return r;
    },
  };
}

/**
 * Accumulates rapid seek keys into one target and applies it `ms` after the last key.
 * `apply(target, done)` must call `done` when the seek finished; only then is the pending target cleared.
 */
export function createSeeker(
  pos: () => number,
  dur: () => number,
  apply: (s: number, done: () => void) => void,
  onChange: (pending: number | null) => void,
  ms = 300,
) {
  let pending: number | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    by(d: number) {
      const max = dur();
      let t = (pending === null ? pos() : pending) + d;
      if (max) t = Math.min(t, max);
      pending = Math.max(0, t);
      onChange(pending);
      clearTimeout(timer);
      timer = setTimeout(() => {
        apply(pending!, () => {
          pending = null;
          onChange(null);
        });
      }, ms);
    },
    pending: () => pending,
    cancel: () => clearTimeout(timer),
  };
}
