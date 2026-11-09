// The item context menu (long-press OK, or the Options button) and the toast that reports its result.
import { useEffect, useRef, useState } from 'preact/hooks';
import { SpatialNavigation } from '@noriginmedia/norigin-spatial-navigation';
import { ApiError, errorText, del, post } from '../api/client';
import { t } from '../i18n';
import { enter, onKey } from '../nav/keys';
import { trackerLinked, trackerName } from '../tracker';
import { bumpOps, getOverride, restoreOverride, setOverride, type ItemState, type Ref } from './item-state';

type Op = 'library_add' | 'library_remove' | 'watched' | 'unwatched';
interface Req {
  ref: Ref;
  state: ItemState;
}

let show: (r: Req | null) => void = () => {};
let notify: (msg: string) => void = () => {};

/** The shared toast. */
export const showToast = (msg: string) => notify(msg);

export function openItemMenu(ref: Ref, state: ItemState) {
  // Watched state needs a linked tracker; without one a season or episode has nothing to offer.
  if (!menuOps(ref, state, trackerLinked()).length) return notify(t('tracker.link', { name: trackerName() }));
  show({ ref, state });
}

/** Menu entries for an item: library only for movies and shows; watched only when a tracker is linked. */
export function menuOps(ref: Ref, state: ItemState, linked = true): Op[] {
  const ops: Op[] = [];
  if (ref.kind === 'movie' || ref.kind === 'show') ops.push(state.in_library === true ? 'library_remove' : 'library_add');
  if (linked) ops.push(state.watched === true ? 'unwatched' : 'watched');
  return ops;
}

export function opError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === 'tracker_not_authorized') return t('tracker.link', { name: trackerName() });
    if (e.code === 'tracker_unsupported') return t('tracker.unsupported', { name: trackerName() });
    if (e.code === 'already_in_library') return t('menu.already_in_library');
    if (e.kind === 'network' || e.kind === 'unauthorized') return errorText(e);
  }
  return t('menu.failed');
}

/** Applies the change at once, then asks the server; on failure puts back exactly what was shown and says why. */
export async function runOp(ref: Ref, op: Op) {
  const patch: ItemState = {};
  if (op === 'library_add' || op === 'library_remove') patch.in_library = op === 'library_add';
  else {
    patch.watched = op === 'watched';
    if (ref.total != null) patch.watched_episodes = op === 'watched' ? ref.total : 0;
  }
  const before = getOverride(ref) && { ...getOverride(ref) };
  setOverride(ref, patch);
  const media = ref.kind === 'movie' ? 'movies' : 'shows';
  try {
    if (op === 'library_add') await post('/library/{media}/{tmdb_id}', { path: { media, tmdb_id: ref.tmdb_id } });
    else if (op === 'library_remove') await del('/library/{media}/{tmdb_id}', { path: { media, tmdb_id: ref.tmdb_id } });
    else {
      const body = { tmdb_id: ref.tmdb_id, season: ref.season, episode: ref.episode };
      // 30 s: the tracker is slow; a custom timeout is never resent.
      if (op === 'watched') await post('/watched/{kind}', { path: { kind: ref.kind }, body, timeout: 30000 });
      else await del('/watched/{kind}', { path: { kind: ref.kind }, body, timeout: 30000 });
    }
    bumpOps();
    notify(t('menu.done.' + op));
  } catch (e) {
    restoreOverride(ref, Object.keys(patch), before);
    notify(opError(e));
  }
}

/** Mount once (App). Owns the menu and the toast. */
export function ItemMenuHost() {
  const [req, setReq] = useState<Req | null>(null);
  const [toast, setToast] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    show = setReq;
    notify = (m) => {
      setToast(m);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setToast(''), 3500);
    };
    return () => ((show = () => {}), (notify = () => {}));
  }, []);
  return (
    <>
      {req && <Menu req={req} onClose={() => setReq(null)} />}
      {toast && <div class="toast">{toast}</div>}
    </>
  );
}

/**
 * Own cursor and keys, norigin paused, so focus never leaves the poster (nothing to restore). Enter counts only as a fresh
 * press (not a repeat, >300 ms after the previous key-down), so the press that opened the menu, its repeats and its key-up can't pick an entry.
 */
function Menu({ req, onClose }: { req: Req; onClose: () => void }) {
  const ops = menuOps(req.ref, req.state, trackerLinked());
  const [cur, setCur] = useState(0);
  const live = useRef({ cur, ops, req, onClose });
  live.current = { cur, ops, req, onClose };
  useEffect(() => {
    SpatialNavigation.pause();
    const off = onKey((a, e) => {
      const s = live.current;
      if (a === 'back') s.onClose();
      else if (a === 'up' || a === 'down') setCur(Math.max(0, Math.min(s.ops.length - 1, s.cur + (a === 'up' ? -1 : 1))));
      else if (a === 'enter' && enter.fresh && !e.repeat) (s.onClose(), void runOp(s.req.ref, s.ops[s.cur]));
      return true;
    }, { global: true });
    return () => {
      off();
      SpatialNavigation.resume();
    };
  }, []);
  return (
    <div class="dialog-backdrop clear">
      <div class="dialog menu">
        <h2>{t('menu.title')}</h2>
        {ops.map((op, i) => (
          <div key={op} class={i === cur ? 'btn focused' : 'btn'}>{t('menu.' + op)}</div>
        ))}
      </div>
    </div>
  );
}
