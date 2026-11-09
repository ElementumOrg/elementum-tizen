import { useContext, useEffect, useRef, useState } from 'preact/hooks';
import { FocusContext, doesFocusableExist, getCurrentFocusKey, setFocus, useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { ApiError, del, errorText, get, post } from '../api/client';
import { t } from '../i18n';
import { LayerContext, stack } from '../nav/stack';
import { Dialog } from '../ui/Dialog';
import { ErrorView } from '../ui/ErrorView';
import { showToast } from '../ui/ItemMenu';
import { ListItem } from '../ui/ListItem';
import { Spinner } from '../ui/Spinner';
import { openDetails } from './Details';
import { applyOverlay, createPoller, neighbour, pruneOverlay, removeActions, stateLabel, statsLine, type Overlay, type Torrent } from './torrents-util';

/** True while this screen's layer is the top one (a pushed screen hides it but keeps it mounted). */
function useOnTop() {
  const layer = useContext(LayerContext);
  const [top, setTop] = useState(stack.isTop(layer));
  useEffect(() => {
    const update = () => setTop(stack.isTop(layer));
    update();
    return stack.subscribe(update);
  }, []);
  return top;
}

const rowKey = (hash: string) => 'torrent-' + hash;

export function Torrents() {
  const [list, setList] = useState<Torrent[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [overlay, setOverlay] = useState<Overlay>({});
  const [sel, setSel] = useState<{ hash: string; remove: boolean } | null>(null);
  const top = useOnTop();
  const poller = useRef(createPoller(() =>
    get('/torrents', { quiet: true }).then(
      (l) => (setList(l), setError(null), setOverlay((o) => pruneOverlay(l, o))),
      (e) => setError(e), // quiet: no waiting dialog; the next poll retries
    ),
  )).current;
  const live = useRef(false); // mounted and on top: only then may anything start the poller
  live.current = top;
  useEffect(() => {
    if (top) poller.start();
    return () => ((live.current = false), poller.stop());
  }, [top]);

  const shown = list && applyOverlay(list, overlay).sort((a, b) => b.added_at - a.added_at || (a.name < b.name ? -1 : 1));
  const cur = sel && shown && shown.filter((x) => x.info_hash === sel.hash)[0];
  const close = () => setSel(null);
  // A removed row takes the focus with it: land on its neighbour (next, else previous), or on the sidebar when none is left.
  const box = useFocusable({ focusKey: 'torrents-list' });
  const hashes = shown ? shown.map((x) => x.info_hash) : null;
  const before = useRef<string[] | null>(hashes);
  useEffect(() => {
    const was = before.current;
    before.current = hashes;
    if (!was || !hashes || hashes.length >= was.length) return;
    const next = neighbour(was, hashes);
    setTimeout(() => doesFocusableExist(getCurrentFocusKey()) || void setFocus(next ? rowKey(next) : hashes.length ? box.focusKey : 'sidebar'), 50);
  }, [hashes && hashes.join()]);
  useEffect(() => {
    if (sel && shown && !cur) setSel(null); // the torrent is gone
  }, [!!cur]);

  /** Shows `patch` at once; the overlay goes when the server's list agrees (or after 10 s), or on failure (back to the server's state, and the user told). */
  const act = async (x: Torrent, patch: Partial<Torrent> | null, send: () => Promise<unknown>) => {
    const h = x.info_hash;
    const drop = () => setOverlay((o) => {
      if (o[h] !== patch) return o; // a newer action owns it now
      const n = { ...o };
      delete n[h];
      return n;
    });
    setOverlay((o) => ({ ...o, [h]: patch }));
    try {
      await send();
      setTimeout(drop, 10000);
    } catch (e) {
      drop();
      showToast(e instanceof ApiError && e.kind === 'network' ? errorText(e) : t('torrents.failed'));
    }
    if (live.current) poller.start();
  };
  const path = (x: Torrent) => ({ info_hash: x.info_hash });
  const toggle = (x: Torrent) =>
    x.paused
      ? act(x, { paused: false, state: x.progress >= 1 ? 'seeding' : 'downloading' }, () => post('/torrents/{info_hash}/resume', { path: path(x) }))
      : act(x, { paused: true, state: 'paused' }, () => post('/torrents/{info_hash}/pause', { path: path(x) }));
  const remove = (x: Torrent, deleteFiles: boolean) =>
    act(x, null, () => del('/torrents/{info_hash}', { path: path(x), query: { delete_files: deleteFiles } }));

  if (!list) return error ? <ErrorView message={errorText(error)} onRetry={() => poller.start()} /> : <Spinner />;
  return (
    <FocusContext.Provider value={box.focusKey}>
    <div ref={box.ref} class="screen torrents">
      <h1>{t('nav.torrents')}</h1>
      {shown!.length === 0 && <p class="empty">{t('torrents.empty')}</p>}
      {shown!.map((x) => (
        <ListItem key={x.info_hash} focusKey={rowKey(x.info_hash)} cls="torrent" onPress={() => setSel({ hash: x.info_hash, remove: false })}>
          <div class="torrent-name">{x.name}</div>
          <div class="torrent-state">
            {x.has_player && <span class="torrent-playing">{t('torrents.playing')}</span>}
            {stateLabel(x)}
          </div>
          <div class="torrent-bar"><div style={`width:${Math.round(Math.min(1, x.progress) * 100)}%`} /></div>
          <div class="torrent-stats">{statsLine(x)}</div>
        </ListItem>
      ))}
      <div class="screen-end" />
    </div>
      {cur && !sel!.remove && (
        <Dialog title={cur.name} onClose={close} actions={[
          { label: t(cur.paused ? 'torrents.resume' : 'torrents.pause'), onPress: () => (close(), void toggle(cur)) },
          { label: t('torrents.remove'), onPress: () => setSel({ hash: cur.info_hash, remove: true }) },
          ...(cur.tmdb_id ? [{ label: t('torrents.open_details'), onPress: () => (close(), openDetails({ type: cur.media_type === 'episode' ? 'show' : 'movie', tmdb_id: cur.tmdb_id!, title: cur.name })) }] : []),
          { label: t('common.cancel'), onPress: close },
        ]} />
      )}
      {cur && sel!.remove && (
        <Dialog title={t('torrents.remove_title')} onClose={close}
          actions={removeActions((files) => (close(), void remove(cur, files)), close)} />
      )}
    </FocusContext.Provider>
  );
}
