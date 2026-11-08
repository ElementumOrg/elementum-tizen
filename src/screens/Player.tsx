import { useContext, useEffect, useRef, useState } from 'preact/hooks';
import { SpatialNavigation } from '@noriginmedia/norigin-spatial-navigation';
import { LayerContext, stack } from '../nav/stack';
import { onKey } from '../nav/keys';
import { t } from '../i18n';
import { del, post } from '../api/client';
import { Dialog } from '../ui/Dialog';
import { create, isAvplay, type Player, type Track } from '../player';
import { createHider, createReporter, createSeeker, formatTime, playerCmd, startAt } from '../player/util';

export interface PlayerSession {
  id: string;
  stream_url: string;
  resume_s: number | null;
  title: string;
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
  const api = useRef<{ exit(): void; setTrack(kind: 'audio' | 'text', i: number): void; menu: Menu }>({ exit() {}, setTrack() {}, menu: null });
  api.current.menu = menu;

  // norigin stays paused while the player is up; dialogs need it to move focus between their buttons.
  useEffect(() => {
    if (menu) SpatialNavigation.resume();
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
    const setState = (on: boolean) => {
      if (on === wasPlaying) return;
      wasPlaying = on;
      setPlaying(on);
      reporter.now();
      show();
    };
    player.onState = setState;
    player.onBuffering = setBuffering;
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
      if (api.current.menu) return false; // the dialog handles its own keys (Back closes it)
      const c = playerCmd(a);
      if (!c) return false;
      show();
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
        case 'hide': setOsd(false); hider.cancel(); break;
        case 'exit': exit(); break;
      }
      return true;
    }, { layer });
    api.current.setTrack = (kind, i) => {
      player.setTrack(kind, i);
      setMenu(null);
      show();
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
      off();
      seeker.cancel();
      document.removeEventListener('visibilitychange', onHidden);
      restoreBg.forEach(([el, b]) => (el.style.background = b));
    };
  }, []);

  const closeMenu = () => {
    setMenu(null);
    if (playing) setOsd(true);
  };
  const trackActions = (kind: 'audio' | 'text') =>
    tracks[kind].map((x) => ({ label: (x.current ? '● ' : '') + x.label, onPress: () => api.current.setTrack(kind, x.index) }));
  const off = { label: (tracks.text.some((x) => x.current) ? '' : '\u25CF ') + t('player.off'), onPress: () => api.current.setTrack('text', -1) };
  const actions = [
    ...trackActions('audio').map((a) => ({ ...a, label: t('player.audio') + ': ' + a.label })),
    { ...off, label: t('player.subtitles') + ': ' + off.label },
    ...trackActions('text').map((a) => ({ ...a, label: t('player.subtitles') + ': ' + a.label })),
  ];

  const shown = seekTo !== null ? seekTo : pos.p;
  const pct = pos.d ? Math.min(100, (shown / pos.d) * 100) : 0;
  return (
    <div class="player" ref={host}>
      {osd && (
        <div class="player-osd">
          <div class="player-top">{session.title}</div>
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
      {menu === 'tracks' && (
        <Dialog title={t('player.tracks')} onClose={closeMenu} actions={[...actions, { label: t('common.cancel'), onPress: closeMenu }]} />
      )}
      {menu === 'error' && (
        <Dialog title={t('player.error')} onClose={() => api.current.exit()} actions={[{ label: t('common.back'), onPress: () => api.current.exit() }]}>
          <p>{t('player.error_text')}</p>
        </Dialog>
      )}
    </div>
  );
}
