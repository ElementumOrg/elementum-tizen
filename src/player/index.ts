import { createAvplay } from './avplay';
import { createHtml5 } from './html5';

export type TrackKind = 'audio' | 'text';
export interface Track {
  index: number;
  label: string;
  current: boolean;
}

/** What the player screen needs; AVPlay (Tizen) and HTML5 `<video>` (browser) both implement it. */
export interface Player {
  open(url: string, startS: number): void;
  play(): void;
  pause(): void;
  /** `done` is called when the seek finished (or failed). */
  seek(s: number, done?: () => void): void;
  /** Seconds; 0 until known. */
  position(): number;
  duration(): number;
  tracks(kind: TrackKind): Track[];
  /** Text index -1 turns subtitles off. */
  setTrack(kind: TrackKind, index: number): void;
  close(): void;
  onState: (playing: boolean) => void;
  onBuffering: (percent: number) => void; // 100 = done
  onError: (message: string) => void;
  onEnded: () => void;
}

/** `host` receives the video surface (and the subtitle overlay on AVPlay). */
export function create(host: HTMLElement): Player {
  return window.webapis && window.webapis.avplay ? createAvplay(host) : createHtml5(host);
}

export const isAvplay = () => !!(window.webapis && window.webapis.avplay);
