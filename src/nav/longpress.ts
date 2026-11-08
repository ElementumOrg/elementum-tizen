/** Hold OK this long (ms) for the context menu. */
export const LONG_PRESS_MS = 600;
/** Once the long press fired, a key-down this long after the last one can't be a repeat: it is a new press. */
const REPEAT_MS = 250;

/**
 * Short vs long OK press. The TV sends one key-down on press and one key-up on release, with no repeats, so a hold is simply
 * "key-down seen, no key-up since" when `ms` have passed. Repeats (other TVs, browsers) just keep it held.
 * Feed it every Enter key-down (`press`) and key-up (`release`).
 * - Short: the key-up arrives before `ms` → `onShort` right away.
 * - Long: still held at `ms` → `onLong` once; the key-up that follows does nothing.
 * A release without a press (the key went down elsewhere) is ignored.
 */
export function createLongPress(onShort: () => void, onLong: () => void, ms = LONG_PRESS_MS) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let start = 0; // time of the first key-down of this hold, 0 = idle
  let last = 0; // time of the latest key-down
  let done = false;

  const end = () => {
    clearTimeout(timer);
    start = 0;
  };
  return {
    press() {
      const now = Date.now();
      if (start && done && now - last > REPEAT_MS) end(); // the key-up after the menu opened was lost
      last = now;
      if (start) return; // a repeat: still held
      start = now;
      done = false;
      timer = setTimeout(() => ((done = true), onLong()), ms);
    },
    /** Focus moved or the item went away while OK is down: forget the hold. */
    cancel: end,
    release() {
      if (!start) return;
      const short = !done;
      end();
      if (short) onShort();
    },
  };
}
