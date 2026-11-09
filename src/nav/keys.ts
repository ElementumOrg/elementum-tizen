import { stack } from './stack';

// Remote/keyboard keys → actions. Arrows and Enter also drive norigin spatial navigation directly.
export type Action =
  | 'up' | 'down' | 'left' | 'right' | 'enter' | 'back'
  | 'playpause' | 'play' | 'pause' | 'stop' | 'ff' | 'rw'
  | 'red' | 'green' | 'yellow' | 'blue';

// Tizen only delivers these keys to the app after registerKey (arrows, Enter and Back are always delivered).
const TIZEN_KEYS = [
  'MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop', 'MediaFastForward', 'MediaRewind',
  'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue',
];

const ACTIONS: { [keyCode: number]: Action } = {
  37: 'left', 38: 'up', 39: 'right', 40: 'down', 13: 'enter',
  10009: 'back', 8: 'back', 27: 'back', // TV Back; Backspace/Escape in a browser
  10252: 'playpause', 415: 'play', 19: 'pause', 413: 'stop', 417: 'ff', 412: 'rw',
  403: 'red', 404: 'green', 405: 'yellow', 406: 'blue',
};

/** Returns true when it handled the key; newer handlers run first (a Dialog shadows the shell). */
export type KeyHandler = (action: Action, e: KeyboardEvent) => boolean | void;
/** A layer handler only runs while its stack layer is on top; a global one always runs. */
export type KeyScope = { layer: number } | { global: true };
interface Registered {
  handler: KeyHandler;
  layer: number; // 0 = global
}
const handlers: Registered[] = [];

export function onKey(handler: KeyHandler, scope: KeyScope): () => void {
  const r = { handler, layer: 'layer' in scope ? scope.layer : 0 };
  handlers.push(r);
  return () => {
    const i = handlers.indexOf(r);
    if (i >= 0) handlers.splice(i, 1);
  };
}

/** Runs handlers newest first until one handles the action; returns whether one did. */
export function dispatch(action: Action, e: KeyboardEvent, isTop: (layer: number) => boolean): boolean {
  for (let i = handlers.length - 1; i >= 0; i--) {
    const r = handlers[i];
    if ((r.layer === 0 || isTop(r.layer)) && r.handler(action, e)) return true;
  }
  return false;
}

export function keyAction(e: Pick<KeyboardEvent, 'keyCode' | 'target'>): Action | undefined {
  // Backspace edits text in inputs (search), so it is Back only elsewhere.
  const tag = e.target && (e.target as Element).tagName;
  if (e.keyCode === 8 && (tag === 'INPUT' || tag === 'TEXTAREA')) return undefined;
  return ACTIONS[e.keyCode];
}

/** Enter's state as the key layer saw it: held (down without an up), and whether the latest down is a fresh press. */
export const enter = { held: false, last: 0, fresh: false };
const FRESH_GAP_MS = 300;

/** Updates `enter` for a key event (Enter only); a down is "fresh" when it isn't a repeat and follows the last one by over 300 ms. */
export function trackEnter(type: 'keydown' | 'keyup', keyCode: number, repeat: boolean, now: number) {
  if (keyCode !== 13) return;
  if (type === 'keyup') return void (enter.held = false);
  enter.fresh = !repeat && now - enter.last > FRESH_GAP_MS;
  enter.last = now;
  enter.held = true;
}

/** Wraps an OK action so only a fresh press runs it: a repeat of the press that opened a dialog can't confirm it. */
export const onFreshEnter = (fn: () => void) => () => {
  if (enter.fresh) fn();
};

export function initKeys() {
  if (typeof tizen !== 'undefined') {
    for (const k of TIZEN_KEYS) {
      try {
        tizen.tvinputdevice.registerKey(k);
      } catch (_) {
        // Not every model has every key (e.g. colour keys); skip it.
      }
    }
  }
  // Capture phase: runs before norigin's own keydown listener, so Buttons see this press's `enter.fresh`.
  window.addEventListener('keyup', (e) => trackEnter('keyup', e.keyCode, false, Date.now()), true);
  window.addEventListener('keydown', (e) => trackEnter('keydown', e.keyCode, e.repeat, Date.now()), true);
  window.addEventListener('keydown', (e) => {
    const action = keyAction(e);
    if (action && dispatch(action, e, stack.isTop)) e.preventDefault();
  });
}
