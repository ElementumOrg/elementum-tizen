import { useContext, useEffect, useRef, useState } from 'preact/hooks';
import { SpatialNavigation } from '@noriginmedia/norigin-spatial-navigation';
import { LayerContext, stack } from '../nav/stack';
import { onKey } from '../nav/keys';
import { t } from '../i18n';
import { del, post } from '../api/client';
import { Dialog } from '../ui/Dialog';
import { TrackPanel } from '../player/TrackPanel';
import { nextTrack, trackLabel } from '../player/tracks';
import { create, isAvplay, type Player, type Track } from '../player';
import { createHider, createReporter, createSeeker, formatTime, playerCmd, startAt } from '../player/util';

export interface PlayerSession {
  id: string;
  stream_url: string;
  resume_s: number | null;
  title: string;
  /** Optional item info for the OSD; poster falls back to backdrop. */
  poster?: string | null;
  backdrop?: string | null;
  /** e.g. "S1E2 · Pilot" */
  subtitle?: string | null;
  year?: number | string | null;
  overview?: string | null;
}

/** Replaces the buffering screen on top of the stack, so leaving pops twice (the stream list is below it). */
export function openPlayer(session: PlayerSession) {
  stack.replace(() => <PlayerScreen session={session} />);
}

type Menu = 'tracks' | 'error' | null;

function PlayerScreen({ session }: { session: PlayerSession }) {
  const layer = useContext(LayerContext);
  const host = useRef<HTMLDivElement>(null);
  const [osd, setOsd] = useState(true);
  const [playing, setPlaying] = useState(true);
  const [buffering, setBuffering] = useState(0); // 100 = not buffering
  const [pos, setPos] = useState({ p: 0, d: 0 });
  const [seekTo, setSeekTo] = useState<number | null>(null);
  const [menu, setMenu] = useState<Menu>(null);
  const [tracks, setTracks] = useState<{ audio: Track[]; text: Track[] }>({ audio: [], text: [] });
  const [warn, setWarn] = useState(false);
  const [toast, setToast] = useState('');
  const api = useRef<{ exit(): void; setTrack(kind: 'audio' | 'text', i: number): void; cycle(kind: 'audio' | 'text'): void; show(): void; menu: Menu }>({ exit() {}, setTrack() {}, cycle() {}, show() {}, menu: null });
  api.current.menu = menu;

  // norigin stays paused while the player is up; only the error dialog needs it (the track panel takes keys itself).
  useEffect(() => {
    if (menu === 'error') SpatialNavigation.resume();
    else SpatialNavigation.pause();
  }, [menu]);

  useEffect(() => {
    const player: Player = create(host.current!);
    const avplay = isAvplay();
    const restoreBg: Array<[HTMLElement, string]> = [];
    if (avplay) {
      // The video plane is behind the page, so the page must be see-through.
      for (const el of [document.documentElement, document.body, host.current!.parentElement!]) {
        restoreBg.push([el, el.style.background]);
        el.style.background = 'transparent';
      }
    }
    let wasPlaying = true;
    let gone = false;
    let began = false;
    let toastTimer: ReturnType<typeof setTimeout> | undefined;
    const hider = createHider(() => setOsd(false));
    const show = () => {
      setOsd(true);
      if (wasPlaying && !api.current.menu) hider.poke();
      else hider.cancel();
    };
    const reporter = createReporter(
      () => ({ position_s: player.position(), duration_s: player.duration(), paused: !wasPlaying }),
      (body) => post('/playback/{id}/progress', { path: { id: session.id }, body, quiet: true }),
      setWarn,
    );
    // The first real playback keeps the item info up for 6 s.
    const started = () => {
      if (began) return;
      began = true;
      setOsd(true);
      if (wasPlaying && !api.current.menu) hider.poke(6000);
    };
    const setState = (on: boolean) => {
      if (on) started();
      if (on === wasPlaying) return;
      wasPlaying = on;
      setPlaying(on);
      reporter.now();
      show();
    };
    player.onState = setState;
    player.onBuffering = (n) => (n >= 100 && started(), setBuffering(n));
    player.onError = () => setMenu('error'); // never show the raw message: it may carry the signed URL

    const exit = () => {
      if (gone) return;
      gone = true;
      clearInterval(tick);
      hider.cancel();
      const id = session.id;
      const rm = () => del('/playback/{id}', { path: { id }, quiet: true }).catch(() => {});
      reporter.finish().then(rm, rm);
      seeker.cancel();
      player.close();
      SpatialNavigation.resume();
      stack.removeWithBelow(layer, 1); // this layer and the stream list under it, wherever they are
    };
    api.current.exit = exit;
    player.onEnded = exit;

    const seeker = createSeeker(
      () => player.position(),
      () => player.duration(),
      (t, done) => player.seek(t, done),
      setSeekTo,
    );
    const tick = setInterval(() => setPos({ p: player.position(), d: player.duration() }), 500);
    player.open(session.stream_url, startAt(session.resume_s));
    reporter.start();
    show();
    const onHidden = () => document.hidden && reporter.now();
    document.addEventListener('visibilitychange', onHidden);

    const off = onKey((a) => {
      if (gone) return true;
      if (api.current.menu === 'error') return false; // the dialog handles its own keys (Back closes it)
      const c = playerCmd(a);
      if (!c) return false;
      // the track panel swallows everything else; only these reach here
      if (api.current.menu && !/^(toggle|play|pause|exit)$/.test(c.type)) return false;
      if (c.type !== 'audio' && c.type !== 'subs') show(); // Green/Yellow only toast
      switch (c.type) {
        case 'seek': seeker.by(c.by); break;
        case 'toggle': wasPlaying ? player.pause() : player.play(); break;
        case 'play': player.play(); break;
        case 'pause': player.pause(); break;
        case 'tracks':
          setTracks({ audio: player.tracks('audio'), text: player.tracks('text') });
          setMenu('tracks');
          hider.cancel();
          break;
        case 'audio': api.current.cycle('audio'); break;
        case 'subs': api.current.cycle('text'); break;
        case 'hide': setOsd(false); hider.cancel(); break;
        case 'exit': exit(); break;
      }
      return true;
    }, { layer });
    api.current.show = show;
    api.current.setTrack = (kind, i) => {
      player.setTrack(kind, i);
      setTracks({ audio: player.tracks('audio'), text: player.tracks('text') });
    };
    api.current.cycle = (kind) => {
      const list = player.tracks(kind);
      const i = nextTrack(kind, list);
      const name = t(kind === 'audio' ? 'player.audio' : 'player.subtitles');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => setToast(''), 2000);
      if (i === undefined) return setToast(name + ': ' + t('player.no_tracks'));
      api.current.setTrack(kind, i);
      setToast(name + ': ' + trackLabel(kind, list, i, t('player.off')));
    };

    return () => {
      // Unmounted by something else (not our exit): still release the player and the session.
      if (!gone) {
        gone = true;
        const rm = () => del('/playback/{id}', { path: { id: session.id }, quiet: true }).catch(() => {});
        reporter.finish().then(rm, rm);
        player.close();
        SpatialNavigation.resume();
      }
      clearInterval(tick);
      hider.cancel();
      clearTimeout(toastTimer);
      off();
      seeker.cancel();
      document.removeEventListener('visibilitychange', onHidden);
      restoreBg.forEach(([el, b]) => (el.style.background = b));
    };
  }, []);

  const closeMenu = () => {
    api.current.menu = null; // show() reads it before the re-render
    setMenu(null);
    api.current.show();
  };
  const shown = seekTo !== null ? seekTo : pos.p;
  const pct = pos.d ? Math.min(100, (shown / pos.d) * 100) : 0;
  return (
    <div class="player" ref={host}>
      {osd && (
        <div class="player-osd">
          <div class="player-top" />
          <div class="player-info">
            {(session.poster || session.backdrop) && (
              <img class="player-poster" src={(session.poster || session.backdrop)!} onError={(e) => ((e.currentTarget as HTMLElement).style.display = 'none')} />
            )}
            <div class="player-info-text">
              <div class="player-title">{session.title}</div>
              {session.subtitle && <div class="player-sub">{session.subtitle}</div>}
              {session.year && <div class="player-year">{session.year}</div>}
              {session.overview && <div class="player-overview">{session.overview}</div>}
            </div>
          </div>
          <div class="player-bottom">
            <div class="player-state">
              {buffering < 100 ? t('player.buffering', { n: Math.round(buffering) }) : playing ? '▶' : '❚❚ ' + t('player.paused')}
            </div>
            <div class="player-bar">
              <div class="player-bar-fill" style={`width:${pct}%`} />
            </div>
            <div class="player-time">{formatTime(shown)} / {formatTime(pos.d)}</div>
            <div class="player-hints">{t('player.hints')}</div>
            {warn && <div class="player-warn">{t('player.progress_warn')}</div>}
          </div>
        </div>
      )}
      {toast && <div class="player-toast">{toast}</div>}
      {menu === 'tracks' && (
        <TrackPanel audio={tracks.audio} text={tracks.text} onPick={(k, i) => api.current.setTrack(k, i)} onClose={closeMenu} />
      )}
      {menu === 'error' && (
        <Dialog title={t('player.error')} onClose={() => api.current.exit()} actions={[{ label: t('common.back'), onPress: () => api.current.exit() }]}>
          <p>{t('player.error_text')}</p>
        </Dialog>
      )}
    </div>
  );
}
