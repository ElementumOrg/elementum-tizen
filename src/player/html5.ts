import type { Player, Track, TrackKind } from '.';

interface TrackList {
  length: number;
  [i: number]: { label: string; language: string; enabled?: boolean; mode?: string };
}

const noop = () => {};

// Dev aid: Chromium has no tracks, so ?fakeTracks=1 fakes some. Vite replaces DEV statically, so production has no stub.
const fake = import.meta.env.DEV && typeof location !== 'undefined' && /[?&]fakeTracks=1/.test(location.search);
const fakeSel = { audio: 0, text: 0 };
const fakeList = (kind: TrackKind): Track[] =>
  (kind === 'audio' ? ['English 5.1', 'Russian 2.0', 'German'] : ['English', 'Russian']).map((label, index) => ({ index, label, current: index === fakeSel[kind] }));

export function createHtml5(host: HTMLElement): Player {
  const v = document.createElement('video');
  v.className = 'player-video';
  host.appendChild(v);
  let closed = false;
  let want = true; // the user's intent; a track switch must not leave the video paused
  const p: Player = {
    open(url, startS) {
      v.src = url;
      if (startS > 0) v.addEventListener('loadedmetadata', () => (v.currentTime = startS), { once: true });
      if (want) void v.play();
    },
    play: () => ((want = true), void v.play()),
    pause: () => ((want = false), v.pause()),
    seek(s, done) {
      if (done) v.addEventListener('seeked', done, { once: true });
      v.currentTime = Math.max(0, Math.min(s, v.duration || s));
    },
    position: () => v.currentTime || 0,
    duration: () => (isFinite(v.duration) ? v.duration : 0),
    tracks(kind: TrackKind): Track[] {
      if (fake) return fakeList(kind);
      const list = (kind === 'audio' ? (v as any).audioTracks : v.textTracks) as TrackList | undefined; // audioTracks is not in lib.dom
      const out: Track[] = [];
      for (let i = 0; list && i < list.length; i++) {
        const tr = list[i];
        out.push({ index: i, label: tr.label || tr.language || String(i + 1), current: kind === 'audio' ? !!tr.enabled : tr.mode === 'showing' });
      }
      return out;
    },
    setTrack(kind, index) {
      const keep = () => {
        if (want && !closed && v.paused && !v.ended) void v.play();
      };
      setTimeout(keep, 0);
      setTimeout(keep, 300);
      if (fake) {
        fakeSel[kind] = index;
        return;
      }
      const list = (kind === 'audio' ? (v as any).audioTracks : v.textTracks) as TrackList | undefined;
      for (let i = 0; list && i < list.length; i++) {
        if (kind === 'audio') list[i].enabled = i === index;
        else list[i].mode = i === index ? 'showing' : 'disabled';
      }
    },
    close() {
      closed = true;
      p.onState = p.onBuffering = p.onError = p.onEnded = noop;
      v.pause();
      v.removeAttribute('src');
      v.load();
      v.remove();
    },
    onState: noop,
    onBuffering: noop,
    onError: noop,
    onEnded: noop,
  };
  v.addEventListener('playing', () => (p.onState(true), p.onBuffering(100)));
  v.addEventListener('pause', () => p.onState(false));
  v.addEventListener('waiting', () => p.onBuffering(0));
  v.addEventListener('ended', () => p.onEnded());
  v.addEventListener('error', () => p.onError(v.error ? 'code ' + v.error.code : ''));
  return p;
}
