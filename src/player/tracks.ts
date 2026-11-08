import type { Action } from '../nav/keys';
import type { Track, TrackKind } from '.';

/** Panel cursor: column 0 = audio, 1 = subtitles (row 0 there is "Off"). */
export interface Cursor {
  col: 0 | 1;
  row: number;
}

/** Row counts per column (the subtitle column includes "Off"). */
export function panelMove(c: Cursor, a: Action, rows: [number, number]): Cursor {
  const clamp = (col: 0 | 1, row: number) => Math.max(0, Math.min(row, Math.max(0, rows[col] - 1)));
  if (a === 'left' || a === 'right') {
    const col = a === 'left' ? 0 : 1;
    return { col, row: clamp(col, c.row) };
  }
  if (a === 'up' || a === 'down') return { col: c.col, row: clamp(c.col, c.row + (a === 'up' ? -1 : 1)) };
  return c;
}

/** Track indices of a column: subtitles get -1 (Off) first. */
export const columnIndices = (kind: TrackKind, list: Track[]) => (kind === 'text' ? [-1] : []).concat(list.map((x) => x.index));

/** Cursor row of the current track (Off when no subtitle is current). */
export function currentRow(kind: TrackKind, list: Track[]): number {
  const i = list.map((x) => x.current).indexOf(true);
  return i < 0 ? 0 : i + (kind === 'text' ? 1 : 0);
}

/** The next track index when cycling (wraps; subtitles go through Off), or undefined when there is nothing to cycle. */
export function nextTrack(kind: TrackKind, list: Track[]): number | undefined {
  const idx = columnIndices(kind, list);
  if (idx.length < 2) return undefined;
  return idx[(currentRow(kind, list) + 1) % idx.length];
}

export function trackLabel(kind: TrackKind, list: Track[], index: number, off: string): string {
  return index < 0 ? off : list.filter((x) => x.index === index).map((x) => x.label)[0] || String(index + 1);
}

export interface PanelResult {
  cursor: Cursor;
  pick?: [TrackKind, number];
  close?: boolean;
  /** false: the key is not the panel's (Stop, Play/Pause...) and goes on to the player. */
  handled: boolean;
}

/** One key in the panel. Everything except the transport keys is swallowed; Enter picks, Back closes. */
export function panelKey(c: Cursor, a: Action, audio: Track[], text: Track[]): PanelResult {
  if (a === 'stop' || a === 'playpause' || a === 'play' || a === 'pause') return { cursor: c, handled: false };
  if (a === 'back') return { cursor: c, close: true, handled: true };
  if (a === 'enter') {
    const kind: TrackKind = c.col ? 'text' : 'audio';
    const idx = columnIndices(kind, kind === 'text' ? text : audio)[c.row];
    return { cursor: c, pick: idx === undefined ? undefined : [kind, idx], handled: true };
  }
  const n = panelMove(c, a, [audio.length, text.length + 1]);
  // moving to the other column starts on its current track, not on the same row
  if (n.col !== c.col) return { cursor: { col: n.col, row: currentRow(n.col ? 'text' : 'audio', n.col ? text : audio) }, handled: true };
  return { cursor: n, handled: true };
}
