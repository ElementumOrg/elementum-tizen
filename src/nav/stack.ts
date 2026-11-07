import { createContext, type ComponentChild } from 'preact';
import { doesFocusableExist, getCurrentFocusKey, setFocus } from '@noriginmedia/norigin-spatial-navigation';

export interface Entry {
  id: number;
  view: () => ComponentChild;
  /** Focus key saved when another screen was pushed on top; restored on pop. */
  focus?: string;
}

export interface FocusIO {
  get(): string;
  /** `key` is the saved focus (if any) of the entry that is on top again. */
  set(key: string | undefined, entryId: number): void;
}

/** Focus key of the container each entry renders into (see main.tsx). */
export const layerKey = (entryId: number) => `layer-${entryId}`;

/** Entry id of the layer a component renders in; 0 = outside any layer (global, always "on top"). */
export const LayerContext = createContext(0);

/** Deeper pushes drop the oldest non-root entry, so details → similar → details… can't grow without bound. */
export const MAX_DEPTH = 6;

export function createStack(focus: FocusIO) {
  let entries: Entry[] = [];
  let nextId = 1;
  const subs: Array<() => void> = [];
  const emit = () => subs.forEach((f) => f());

  return {
    get entries() {
      return entries;
    },
    push(view: () => ComponentChild) {
      const top = entries[entries.length - 1];
      if (top) top.focus = focus.get();
      entries = entries.concat({ id: nextId++, view });
      if (entries.length > MAX_DEPTH) entries.splice(1, 1);
      emit();
    },
    replace(view: () => ComponentChild) {
      entries = entries.slice(0, -1).concat({ id: nextId++, view });
      emit();
    },
    isTop(layer: number): boolean {
      return layer === 0 || (entries.length > 0 && entries[entries.length - 1].id === layer);
    },
    /** Returns false on the root screen (nothing to pop). */
    pop(): boolean {
      if (entries.length < 2) return false;
      entries = entries.slice(0, -1);
      emit();
      const top = entries[entries.length - 1];
      focus.set(top.focus, top.id);
      return true;
    },
    subscribe(fn: () => void): () => void {
      subs.push(fn);
      return () => {
        const i = subs.indexOf(fn);
        if (i >= 0) subs.splice(i, 1);
      };
    },
  };
}

// The screen below stayed mounted (hidden), so its focusable normally still exists; if it is gone
// (e.g. the focus was in a Dialog that is closed now), focus that screen instead.
export const stack = createStack({
  get: getCurrentFocusKey,
  set: (key, id) => void setFocus(key && doesFocusableExist(key) ? key : layerKey(id)),
});

export function exitApp() {
  if (typeof tizen === 'undefined') return;
  try {
    tizen.application.getCurrentApplication().exit();
  } catch (_) {
    // Nothing left to do if the platform refuses.
  }
}
