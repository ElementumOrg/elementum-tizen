import { useContext, useEffect, useRef, useState } from 'preact/hooks';
import { FocusContext, useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { t } from '../i18n';
import type { components } from '../api/schema';
import { ApiError, del, errorText, get, post } from '../api/client';
import { LayerContext, stack } from '../nav/stack';
import { onKey } from '../nav/keys';
import { useClaimFocus } from '../nav/focus';
import { Backdrop } from '../ui/Backdrop';
import { Dialog } from '../ui/Dialog';
import { ErrorView } from '../ui/ErrorView';
import { ListItem } from '../ui/ListItem';
import { Spinner } from '../ui/Spinner';
import { openPlayer } from './Player';
import { formatRate, formatSize, startPoller, streamBadges, type Poller, type Session, type Stream } from './streams-util';

/** `backdrops`/`poster`/`year`/`subtitle` (episode label, "S1E2 · Pilot")/`overview` are optional context for the backgrounds and the buffering dialog. */
type Extra = { backdrops?: string[]; poster?: string; year?: number | null; subtitle?: string; overview?: string };
export type StreamTarget =
  | ({ type: 'movie'; tmdb_id: number; title: string } & Extra)
  | ({ type: 'episode'; tmdb_id: number; season: number; episode: number; title: string } & Extra);

export function openStreams(target: StreamTarget) {
  stack.push(() => <StreamsScreen target={target} />);
}

const SEARCH_TIMEOUT = 60000;

function search(target: StreamTarget) {
  return target.type === 'movie'
    ? get('/movies/{tmdb_id}/streams', { path: { tmdb_id: target.tmdb_id }, timeout: SEARCH_TIMEOUT })
    : get('/shows/{tmdb_id}/seasons/{season}/episodes/{episode}/streams', {
        path: { tmdb_id: target.tmdb_id, season: target.season, episode: target.episode },
        timeout: SEARCH_TIMEOUT,
      });
}

function StreamsScreen({ target }: { target: StreamTarget }) {
  const [list, setList] = useState<Stream[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [reload, setReload] = useState(0);
  const [secs, setSecs] = useState(0);

  useEffect(() => {
    setList(null);
    setError(null);
    setSecs(0);
    const timer = setInterval(() => setSecs((n) => n + 1), 1000);
    const req = search(target);
    req.then(
      (r) => (clearInterval(timer), setList(r)),
      (e) => (clearInterval(timer), e.code !== 'aborted' && setError(e)),
    );
    // Back pops this layer, which aborts the search.
    return () => (clearInterval(timer), req.abort());
  }, [reload]);

  const retry = () => setReload((n) => n + 1);
  let body;
  if (error) {
    const code = error instanceof ApiError ? error.code : '';
    const msg = code === 'providers_unavailable' ? t('streams.providers_unavailable') : code === 'timeout' ? t('streams.timeout') : errorText(error);
    body = <ErrorView message={msg} onRetry={retry} />;
  } else if (!list)
    body = (
      <div class="searching">
        <Spinner />
        <p>{t('streams.searching', { s: secs })}</p>
      </div>
    );
  else if (!list.length) body = <ErrorView message={t('streams.none')} onRetry={retry} />;
  else body = <StreamList target={target} list={list} />;
  return (
    <>
      <Backdrop images={target.backdrops || []} />
      {body}
    </>
  );
}

function StreamList({ target, list }: { target: StreamTarget; list: Stream[] }) {
  const { ref, focusKey, focusSelf } = useFocusable();
  useClaimFocus(focusKey, focusSelf);
  const layer = useContext(LayerContext);
  const busy = useRef(false);
  const alive = useRef(true);
  const [failed, setFailed] = useState<unknown>(null);
  useEffect(() => () => void (alive.current = false), []);

  const start = (s: Stream) => {
    if (busy.current || !stack.isTop(layer)) return; // a double Enter must not push two buffering layers
    busy.current = true;
    setFailed(null);
    const body = { uri: s.uri, type: target.type, tmdb_id: target.tmdb_id, season: target.type === 'episode' ? target.season : undefined, episode: target.type === 'episode' ? target.episode : undefined };
    post('/playback', { body }).then(
      (session) => {
        busy.current = false;
        if (alive.current) openBuffering(session, body, target);
        else del('/playback/{id}', { path: { id: session.id }, quiet: true }).catch(() => {});
      },
      (e) => {
        busy.current = false;
        if (alive.current) setFailed(e);
      },
    );
  };

  return (
    <FocusContext.Provider value={focusKey}>
      <div ref={ref} class="screen streams">
        <h1>{target.title + (target.subtitle ? ' · ' + target.subtitle : '')}</h1>
        {failed != null && <p class="stream-error">{errorText(failed)}</p>}
        {list.map((s, i) => (
          <ListItem key={i} cls="stream" onPress={() => start(s)}>
            <div class="stream-name">{s.name}</div>
            <div class="badges">
              {streamBadges(s).map((b) => <span class="badge">{b}</span>)}
              <span class="badge seeds">{t('streams.seeds_peers', { seeds: s.seeds, peers: s.peers })}</span>
              <span class="badge provider">{s.provider}</span>
            </div>
          </ListItem>
        ))}
      </div>
    </FocusContext.Provider>
  );
}

type PlaybackBody = components['schemas']['PlaybackRequest'];

function openBuffering(first: Session, body: PlaybackBody, target: StreamTarget) {
  stack.push(() => <Buffering first={first} body={body} target={target} />);
}

const ROTATE_S = 8;

function Buffering({ first, body, target }: { first: Session; body: PlaybackBody; target: StreamTarget }) {
  const title = target.title + (target.subtitle ? ' · ' + target.subtitle : '');
  const layer = useContext(LayerContext);
  const [session, setSession] = useState(first);
  const [error, setError] = useState<unknown>(null);
  const poller = useRef<Poller | null>(null);
  const id = useRef(first.id); // the live session id (changes after a file choice)
  const busy = useRef(false);
  const left = useRef(false);

  const cancel = () => {
    if (left.current) return;
    left.current = true;
    poller.current?.stop();
    del('/playback/{id}', { path: { id: id.current }, quiet: true }).catch(() => {});
    stack.pop();
  };

  const onSession = (s: Session): boolean | void => {
    setSession(s);
    if (s.state === 'ready' && s.stream_url) {
      if (!stack.isTop(layer)) return false; // keep polling (keeps the session alive); open the player once on top again
      left.current = true;
      openPlayer({ id: s.id, stream_url: s.stream_url, resume_s: s.resume_s, title });
    } else if (s.state === 'stopped') {
      left.current = true;
      if (stack.isTop(layer)) stack.pop();
    }
  };

  const poll = (sid: string) => {
    poller.current = startPoller(sid, (x) => get('/playback/{id}', { path: { id: x }, quiet: true }), onSession, setError);
  };

  useEffect(() => {
    poll(first.id);
    const off = onKey((a) => a === 'back' && !left.current && (cancel(), true), { layer });
    return () => {
      left.current = true; // no state updates or navigation after unmount
      poller.current?.stop();
      off();
    };
  }, []);

  const choose = (index: number) => {
    if (busy.current) return;
    busy.current = true;
    poller.current?.stop(); // the old id may turn `stopped` once the new session replaces it
    post('/playback', { body: { ...body, file_index: index } }).then(
      (s) => {
        busy.current = false;
        if (left.current) return void del('/playback/{id}', { path: { id: s.id }, quiet: true }).catch(() => {});
        id.current = s.id;
        setSession(s);
        poll(s.id);
      },
      (e) => {
        busy.current = false;
        if (!left.current) setError(e);
      },
    );
  };

  const failedMsg = error != null || session.state === 'error';
  const pct = Math.max(0, Math.min(100, session.buffer_progress || 0));
  const picking = session.state === 'choosing_file' && session.files;
  return (
    <>
      <Backdrop images={target.backdrops || []} interval={ROTATE_S} />
      {failedMsg ? (
        <Dialog
          clear
          key="error"
          title={target.title}
          onClose={cancel}
          actions={[{ label: t('common.back'), onPress: cancel }]}
        >
          <p class="stream-error">{error != null ? errorText(error) : t('buffering.failed')}</p>
        </Dialog>
      ) : picking ? (
        <Dialog clear key="pick" title={t('buffering.choose_file')} onClose={cancel} actions={session.files!.map((f) => ({ label: `${f.name} (${formatSize(f.size_bytes)})`, onPress: () => choose(f.index) }))} />
      ) : (
        <Dialog clear key="buf" title={t('buffering.title')} onClose={cancel} actions={[{ label: t('common.cancel'), onPress: cancel }]}>
          <div class="buffer-panel">
            {target.poster && <img src={target.poster} alt="" />}
            <div class="buffer-info">
              <h3>{target.title}</h3>
              {(target.subtitle || target.year) && <p>{target.subtitle || target.year}</p>}
              <p class="buffer-state">{t('buffering.' + session.state)}</p>
              <div class="progress"><div class="progress-fill" style={'width:' + pct + '%'} /></div>
              <p class="buffer-stats">
                {Math.round(pct) + '% · ' + formatRate(session.download_rate) + ' · ' + t('streams.seeds_peers', { seeds: session.seeds, peers: session.peers })}
              </p>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
