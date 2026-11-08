/** Hold OK this long (ms) for the context menu. */
export const LONG_PRESS_MS = 600;
/** A key-down (or repeat) this recent means the key is still held. Also the gap that bridges "key-up after every repeat". */
export const HELD_MS = 250;
// A press older than this with no event since means everything was lost (focus moved): start fresh.
const STALE_MS = 1500;

/**
 * Short vs long OK press, tolerant of how TV remotes report keys. Feed it every Enter key-down (`press`, repeats included)
 * and every key-up (`release`).
 * - Quick tap: `onShort` once the key-up has been quiet for HELD_MS (a following key-down continues the same hold).
 * - Hold: at `ms`, `onLong` if a key-down arrived within HELD_MS (still held), even if key-ups came in between;
 *   otherwise (no repeats, or the key-up was lost) it counts as a short press.
 * It fires once per hold. A release without a press (the key went down elsewhere) is ignored.
 */
export function createLongPress(onShort: () => void, onLong: () => void, ms = LONG_PRESS_MS) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let gap: ReturnType<typeof setTimeout> | undefined;
  let start = 0; // time of the first key-down of this hold, 0 = idle
  let last = 0; // time of the latest key-down
  let done = false;

  const end = () => {
    clearTimeout(timer);
    clearTimeout(gap);
    start = 0;
  };
  const decide = (long: boolean) => {
    if (done) return;
    done = true;
    clearTimeout(gap);
    if (long) onLong();
    else onShort();
  };
  return {
    press() {
      const now = Date.now();
      if (start && now - last > STALE_MS) end();
      clearTimeout(gap);
      gap = undefined;
      last = now;
      if (start) return;
      start = now;
      done = false;
      timer = setTimeout(() => decide(Date.now() - last <= HELD_MS), ms);
    },
    release() {
      if (!start) return;
      clearTimeout(gap);
      gap = setTimeout(() => (decide(false), end()), HELD_MS);
    },
  };
}
