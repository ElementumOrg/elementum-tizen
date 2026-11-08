// Watched / library state of posters and episodes: badge derivation, in-place overrides, first-unwatched pick.
import { useContext, useEffect, useRef, useState } from 'preact/hooks';
import { LayerContext, stack } from '../nav/stack';

export type Kind = 'movie' | 'show' | 'season' | 'episode';
/** What an API action needs to address an item; `total` = episodes in a season (for the "n/total" count). */
export interface Ref {
  kind: Kind;
  tmdb_id: number;
  season?: number;
  episode?: number;
  total?: number;
}
/** Every field is null/undefined when unknown (no tracker): nothing is shown then. */
export interface ItemState {
  in_library?: boolean | null;
  in_collection?: boolean | null;
  in_watchlist?: boolean | null;
  watched?: boolean | null;
  watched_episodes?: number | null;
  progress?: number | null;
}

export type Badge = 'watched' | 'library' | 'collection' | 'watchlist';

/** Corner icons to draw, in order; only a true flag counts. */
export function badgesOf(s: ItemState): Badge[] {
  const out: Badge[] = [];
  if (s.watched === true) out.push('watched');
  if (s.in_library === true) out.push('library');
  if (s.in_collection === true) out.push('collection');
  if (s.in_watchlist === true) out.push('watchlist');
  return out;
}

/** Progress bar fraction; 0 = no bar (unknown, none, or already finished). */
export function progressOf(p: number | null | undefined): number {
  return typeof p === 'number' && p > 0 && p < 1 ? p : 0;
}

/** Episode resume point as a fraction of the runtime (minutes); null when either is unknown. */
export function resumeFraction(resume_s: number | null | undefined, runtimeMin: number | null | undefined): number | null {
  if (!resume_s || !runtimeMin) return null;
  return Math.min(1, resume_s / (runtimeMin * 60));
}

/** Index of the first item not known to be watched (unknown counts as unwatched); `fallback` when all are watched. */
export function firstUnwatched(items: { watched?: boolean | null }[], fallback: number): number {
  for (let i = 0; i < items.length; i++) if (items[i].watched !== true) return i;
  return fallback;
}

// ---- Overrides: what the user just changed, shown on every poster of that item until newer server data arrives ----

export const refKey = (r: Ref) => [r.kind, r.tmdb_id, r.season, r.episode].join(':');
const over: { [key: string]: ItemState } = {};
const subs: { [key: string]: Array<() => void> } = {};
const notify = (k: string) => (subs[k] || []).slice().forEach((f) => f());

export const getOverride = (r: Ref): ItemState | undefined => over[refKey(r)];

export function setOverride(r: Ref, patch: ItemState) {
  const k = refKey(r);
  over[k] = { ...over[k], ...patch };
  notify(k);
}

/** Puts `keys` back as they were in `before` (a snapshot of getOverride): restored if they had an override, deleted if not. */
export function restoreOverride(r: Ref, keys: string[], before: ItemState | undefined) {
  const k = refKey(r);
  const o: { [key: string]: unknown } = { ...over[k] };
  for (const key of keys) {
    if (before && key in before) o[key] = (before as { [key: string]: unknown })[key];
    else delete o[key];
  }
  over[k] = o as ItemState;
  notify(k);
}

/** The override keys that still differ from `base`: once the server reports the same value, it has caught up. */
export function effectiveOverride(r: Ref, base: ItemState): ItemState | undefined {
  const o = over[refKey(r)] as { [key: string]: unknown } | undefined;
  if (!o) return undefined;
  const out: { [key: string]: unknown } = {};
  let any = false;
  for (const key in o) {
    if (o[key] !== undefined && (base as { [key: string]: unknown })[key] !== o[key]) (out[key] = o[key]), (any = true);
  }
  return any ? (out as ItemState) : undefined;
}

/**
 * `base` with the user's changes applied; re-renders when they change. A change is dropped when the server data it was
 * applied over is replaced by a newer object (a refetch), so later server changes win.
 */
export function useItemState<T extends ItemState>(r: Ref | undefined, base: T): T {
  const [, tick] = useState(0);
  const k = r && refKey(r);
  const seen = useRef<{ o?: ItemState; base?: T }>({});
  useEffect(() => {
    if (!k) return;
    const f = () => tick((n) => n + 1);
    (subs[k] = subs[k] || []).push(f);
    return () => void subs[k].splice(subs[k].indexOf(f), 1);
  }, [k]);
  if (!r || !k || !over[k]) return base;
  if (seen.current.o !== over[k]) seen.current = { o: over[k], base };
  else if (seen.current.base !== base) return base; // newer server data than the change
  const o = effectiveOverride(r, base);
  return o ? { ...base, ...o } : base;
}

// ---- Changes bump a counter; screens refetch when they come back on top after one ----

let ops = 0;
export const bumpOps = () => ++ops;

/** Calls `reload` when this layer is on top again and an item changed since it last looked. */
export function useRefreshAfterChanges(reload: () => void) {
  const layer = useContext(LayerContext);
  const live = useRef(reload);
  live.current = reload;
  useEffect(() => {
    let seen = ops;
    return stack.subscribe(() => {
      if (ops !== seen && stack.isTop(layer)) {
        seen = ops;
        live.current();
      }
    });
  }, []);
}
