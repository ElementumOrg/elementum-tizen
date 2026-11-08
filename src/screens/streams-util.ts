import type { components } from '../api/schema';

export type Stream = components['schemas']['Stream'];
export type Session = components['schemas']['PlaybackSession'];

/** 1.50 GB / 700 MB (1024-based, like most torrent clients). */
export function formatSize(bytes: number): string {
  const mb = bytes / 1048576;
  return mb >= 1024 ? (mb / 1024).toFixed(2) + ' GB' : Math.round(mb) + ' MB';
}

/** 2.5 MB/s / 300 KB/s */
export function formatRate(bytesPerSec: number): string {
  return bytesPerSec >= 1048576 ? (bytesPerSec / 1048576).toFixed(1) + ' MB/s' : Math.round(bytesPerSec / 1024) + ' KB/s';
}

/** Badge texts in display order; fields the provider did not report are left out. */
export function streamBadges(s: Stream): string[] {
  const b = [s.resolution, s.rip, s.codec, s.audio, s.language, s.size_bytes ? formatSize(s.size_bytes) : null];
  return b.filter((x): x is string => !!x);
}

const DONE = ['ready', 'error', 'stopped'];
const MAX_FAILS = 3;

export interface Poller {
  stop(): void;
}

/**
 * Polls one session at a time: the next request is scheduled `interval` ms after the previous one finished,
 * so requests never overlap. Stops after a final state, `stop()`, or MAX_FAILS failures in a row (then onError).
 * A callback never fires after stop(). After a file choice, stop this poller and start a new one for the new id.
 * `onSession` may return false to keep polling past a final state (the screen isn't ready to act on it yet).
 */
export function startPoller(
  id: string,
  fetchSession: (id: string) => Promise<Session>,
  onSession: (s: Session) => boolean | void,
  onError: (e: unknown) => void,
  interval = 1000,
): Poller {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let fails = 0;
  const tick = () => {
    fetchSession(id).then(
      (s) => {
        if (stopped) return;
        fails = 0;
        const handled = onSession(s) !== false;
        if (handled && DONE.indexOf(s.state) >= 0) stopped = true;
        else schedule();
      },
      (e) => {
        if (stopped) return;
        if (++fails >= MAX_FAILS) {
          stopped = true;
          onError(e);
        } else schedule();
      },
    );
  };
  const schedule = () => {
    timer = setTimeout(tick, interval);
  };
  tick();
  return {
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}
