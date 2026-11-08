import type { Player, Track, TrackKind } from '.';

interface TrackList {
  length: number;
  [i: number]: { label: string; language: string; enabled?: boolean; mode?: string };
}

const noop = () => {};

export function createHtml5(host: HTMLElement): Player {
  const v = document.createElement('video');
  v.className = 'player-video';
  host.appendChild(v);
  const p: Player = {
    open(url, startS) {
      v.src = url;
      if (startS > 0) v.addEventListener('loadedmetadata', () => (v.currentTime = startS), { once: true });
      void v.play();
    },
    play: () => void v.play(),
    pause: () => v.pause(),
    seek(s, done) {
      if (done) v.addEventListener('seeked', done, { once: true });
      v.currentTime = Math.max(0, Math.min(s, v.duration || s));
    },
    position: () => v.currentTime || 0,
    duration: () => (isFinite(v.duration) ? v.duration : 0),
    tracks(kind: TrackKind): Track[] {
      const list = (kind === 'audio' ? (v as any).audioTracks : v.textTracks) as TrackList | undefined; // audioTracks is not in lib.dom
      const out: Track[] = [];
      for (let i = 0; list && i < list.length; i++) {
        const tr = list[i];
        out.push({ index: i, label: tr.label || tr.language || String(i + 1), current: kind === 'audio' ? !!tr.enabled : tr.mode === 'showing' });
      }
      return out;
    },
    setTrack(kind, index) {
      const list = (kind === 'audio' ? (v as any).audioTracks : v.textTracks) as TrackList | undefined;
      for (let i = 0; list && i < list.length; i++) {
        if (kind === 'audio') list[i].enabled = i === index;
        else list[i].mode = i === index ? 'showing' : 'disabled';
      }
    },
    close() {
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
