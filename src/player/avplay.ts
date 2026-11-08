import type { Player, Track, TrackKind } from '.';

const noop = () => {};

/** Every AVPlay call throws in the wrong state, so each goes through here. */
function safe<T>(f: () => T, fallback: T): T {
  try {
    return f();
  } catch (_) {
    return fallback;
  }
}

const CHANNELS: { [n: string]: string } = { '1': '1.0', '2': '2.0', '6': '5.1', '8': '7.1' };

function label(t: AVPlayTrack): string {
  const info = safe(() => (JSON.parse(t.extra_info) || {}) as { [k: string]: string | undefined }, {} as { [k: string]: string | undefined });
  const lang = info.language || info.track_lang || String(t.index + 1);
  if (t.type !== 'AUDIO') return lang;
  const codec = info.fourCC || info.codec || '';
  const ch = info.channels ? CHANNELS[String(info.channels)] || info.channels + 'ch' : '';
  const tail = [codec, ch].filter(Boolean).join(' ');
  return tail ? lang + ' \u00B7 ' + tail : lang;
}

export function createAvplay(host: HTMLElement): Player {
  const av = window.webapis!.avplay!;
  host.classList.add('avplay'); // the video plane is behind the page: CSS makes the host transparent
  const obj = document.createElement('object');
  obj.setAttribute('type', 'application/avplayer');
  obj.className = 'player-video';
  const sub = document.createElement('div');
  sub.className = 'player-subs';
  host.appendChild(obj);
  host.appendChild(sub);
  const cur: { audio?: number; text?: number } = {};
  let subTimer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  const showSub = (text: string, ms: number) => {
    clearTimeout(subTimer);
    sub.textContent = text;
    if (text && ms > 0) subTimer = setTimeout(() => (sub.textContent = ''), ms);
  };
  const selected = (type: string) => safe(() => av.getCurrentStreamInfo(), [] as AVPlayTrack[]).filter((t) => t.type === type)[0];

  const onVisibility = () => safe(() => (document.hidden ? av.suspend() : av.restore()), undefined);
  document.addEventListener('visibilitychange', onVisibility);

  const p: Player = {
    open(url, startS) {
      try {
        av.open(url);
      } catch (e) {
        return p.onError(String(e));
      }
      safe(() => av.setDisplayRect(0, 0, 1920, 1080), undefined);
      safe(
        () =>
          av.setListener({
            onbufferingstart: () => p.onBuffering(0),
            onbufferingprogress: (pc) => p.onBuffering(pc),
            onbufferingcomplete: () => p.onBuffering(100),
            onstreamcompleted: () => void setTimeout(() => p.onEnded(), 0),
            onerror: (e) => !closed && p.onError(String(e)),
            onsubtitlechange: (d, text) => showSub(text.replace(/<[^>]*>/g, ''), d),
          }),
        undefined,
      );
      safe(() => av.setSilentSubtitle(true), undefined); // off unless the stream has a selected text track
      try {
        av.prepareAsync(
          () => {
            if (closed) return;
            const st = selected('TEXT');
            cur.text = st ? st.index : -1; // so the panel and Yellow know the real state
            if (st) safe(() => av.setSilentSubtitle(false), undefined);
            const play = () => {
              safe(() => av.play(), undefined);
              p.onBuffering(100);
              p.onState(true);
            };
            if (startS > 0) {
              try {
                av.seekTo(startS * 1000, play, play);
              } catch (_) {
                play();
              }
            } else play();
          },
          (e) => !closed && p.onError(String(e)),
        );
      } catch (e) {
        p.onError(String(e));
      }
    },
    play() {
      safe(() => av.play(), undefined);
      p.onState(true);
    },
    pause() {
      safe(() => av.pause(), undefined);
      p.onState(false);
    },
    seek(s, done) {
      const d = p.duration();
      const target = Math.max(0, d ? Math.min(s, d) : s) * 1000;
      const fin = done || noop;
      try {
        av.seekTo(target, fin, fin);
      } catch (_) {
        fin();
      }
    },
    position: () => safe(() => av.getCurrentTime() / 1000, 0),
    duration: () => safe(() => av.getDuration() / 1000, 0),
    tracks(kind: TrackKind): Track[] {
      const type = kind === 'audio' ? 'AUDIO' : 'TEXT';
      const now = cur[kind] !== undefined ? cur[kind] : kind === 'audio' ? (selected('AUDIO') || { index: -1 }).index : undefined;
      return safe(() => av.getTotalTrackInfo(), [] as AVPlayTrack[])
        .filter((t) => t.type === type)
        .map((t) => ({ index: t.index, label: label(t), current: t.index === now }));
    },
    setTrack(kind, index) {
      cur[kind] = index;
      if (kind === 'text') {
        showSub('', 0);
        safe(() => av.setSilentSubtitle(index < 0), undefined);
        if (index < 0) return;
      }
      safe(() => av.setSelectTrack(kind === 'audio' ? 'AUDIO' : 'TEXT', index), undefined);
    },
    close() {
      closed = true;
      p.onState = p.onBuffering = p.onError = p.onEnded = noop;
      clearTimeout(subTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      safe(() => av.stop(), undefined);
      safe(() => av.close(), undefined);
      obj.remove();
      sub.remove();
    },
    onState: noop,
    onBuffering: noop,
    onError: noop,
    onEnded: noop,
  };
  return p;
}
