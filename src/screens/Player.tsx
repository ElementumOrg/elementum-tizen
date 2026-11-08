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
import { createHider, createReporter, createSeeker, formatTime, startAt } from '../player/util';

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

// Focus order of the button row; PLAY is the primary one.
const BTNS = ['back10', 'play', 'fwd10', 'audio', 'subs'] as const;
const PLAY = 1;
const ICONS: { [k: string]: string } = {
  back10: 'M12 5V2L7 6.5 12 11V8a6 6 0 1 1-6 6H4a8 8 0 1 0 8-9z',
  fwd10: 'M12 5V2l5 4.5L12 11V8a6 6 0 1 0 6 6h2a8 8 0 1 1-8-9z',
  play: 'M8 5v14l11-7z',
  pause: 'M6 5h4v14H6zM14 5h4v14h-4z',
  audio: 'M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z',
  subs: 'M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zM6 10h4v2H6v-2zm8 6H6v-2h8v2zm4 0h-2v-2h2v2zm0-4h-6v-2h6v2z',
};
const Icon = ({ k }: { k: string }) => (
  <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor"><path d={ICONS[k]} /></svg>
);

function PlayerScreen({ session }: { session: PlayerSession }) {
  const layer = useContext(LayerContext);
  const host = useRef<HTMLDivElement>(null);
  const [osd, setOsd] = useState(true);
  const [playing, setPlaying] = useState(true);
  const [buffering, setBuffering] = useState(0); // 100 = not buffering
  const [pos, setPos] = useState({ p: 0, d: 0 });
  const [seekTo, setSeekTo] = useState<number | null>(null);
  const [menu, setMenu] = useState<Menu>(null);
  const [panelCol, setPanelCol] = useState<0 | 1>(0);
  const [focus, setFocus] = useState(PLAY); // 0..4 buttons, -1 = progress bar
  const [tracks, setTracks] = useState<{ audio: Track[]; text: Track[] }>({ audio: [], text: [] });
  const [warn, setWarn] = useState(false);
  const [toast, setToast] = useState('');
  const api = useRef<{ exit(): void; setTrack(kind: 'audio' | 'text', i: number): void; cycle(kind: 'audio' | 'text'): void; show(): void; menu: Menu; osd: boolean; focus: number }>({ exit() {}, setTrack() {}, cycle() {}, show() {}, menu: null, osd: true, focus: PLAY });
  api.current.menu = menu;
  api.current.osd = osd;
  api.current.focus = focus;

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
      const openPanel = (col: 0 | 1) => {
        setTracks({ audio: player.tracks('audio'), text: player.tracks('text') });
        setPanelCol(col);
        setMenu('tracks');
        hider.cancel();
      };
      const f = api.current.focus;
      const arrow = a === 'left' || a === 'right' || a === 'up' || a === 'down' || a === 'enter';
      if (arrow && !api.current.menu) {
        // Hidden OSD: any arrow or OK only shows it (OK must not pause).
        if (!api.current.osd) {
          setFocus(PLAY);
          show();
          return true;
        }
        show();
        if (f < 0) {
          if (a === 'left' || a === 'right') seeker.by(a === 'left' ? -10 : 10);
          else if (a === 'down') setFocus(PLAY);
        } else if (a === 'left' || a === 'right') setFocus(Math.max(0, Math.min(BTNS.length - 1, f + (a === 'left' ? -1 : 1))));
        else if (a === 'up') setFocus(-1);
        else if (a === 'down') (setOsd(false), hider.cancel());
        else {
          const b = BTNS[f];
          if (b === 'back10') seeker.by(-10);
          else if (b === 'fwd10') seeker.by(10);
          else if (b === 'play') wasPlaying ? player.pause() : player.play();
          else openPanel(b === 'audio' ? 0 : 1);
        }
        return true;
      }
      const transport = a === 'playpause' || a === 'play' || a === 'pause' || a === 'ff' || a === 'rw' || a === 'back' || a === 'stop';
      if (api.current.menu && !transport) return false; // the track panel swallows everything else
      if (a === 'green') return api.current.cycle('audio'), true; // Green/Yellow only toast
      if (a === 'yellow') return api.current.cycle('text'), true;
      if (!transport) return false;
      show();
      if (a === 'ff') seeker.by(60);
      else if (a === 'rw') seeker.by(-60);
      else if (a === 'playpause') wasPlaying ? player.pause() : player.play();
      else if (a === 'play') player.play();
      else if (a === 'pause') player.pause();
      else exit();
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
          <div class="player-bottom">
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
            {buffering < 100 && <div class="player-state">{t('player.buffering', { n: Math.round(buffering) })}</div>}
            <div class={'player-bar' + (focus < 0 ? ' player-bar-focus' : '')}>
              <div class="player-bar-fill" style={`width:${pct}%`} />
              <div class="player-bar-knob" style={`left:${pct}%`} />
            </div>
            <div class="player-time">
              <span>{formatTime(shown)}</span>
              <span>-{formatTime(Math.max(0, pos.d - shown))}</span>
            </div>
            <div class="player-btns">
              {BTNS.map((b, i) => {
                const label = b === 'play' ? t(playing ? 'player.pause' : 'player.play') : b === 'audio' ? t('player.audio') : b === 'subs' ? t('player.subtitles') : t('player.' + b);
                return (
                  <div key={b} class={'player-btn' + (b === 'play' ? ' player-btn-main' : '') + (focus === i ? ' player-btn-on' : '')}>
                    <div class="player-btn-ico"><Icon k={b === 'play' && playing ? 'pause' : b} /></div>
                    <div class="player-btn-label">{label}</div>
                  </div>
                );
              })}
            </div>
            <div class="player-hints">{t('player.hints')}</div>
            {warn && <div class="player-warn">{t('player.progress_warn')}</div>}
          </div>
        </div>
      )}
      {toast && <div class="player-toast">{toast}</div>}
      {menu === 'tracks' && (
        <TrackPanel audio={tracks.audio} text={tracks.text} onPick={(k, i) => api.current.setTrack(k, i)} onClose={closeMenu} col={panelCol} />
      )}
      {menu === 'error' && (
        <Dialog title={t('player.error')} onClose={() => api.current.exit()} actions={[{ label: t('common.back'), onPress: () => api.current.exit() }]}>
          <p>{t('player.error_text')}</p>
        </Dialog>
      )}
    </div>
  );
}
