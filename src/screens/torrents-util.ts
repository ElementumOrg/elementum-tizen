import type { components } from '../api/schema';
import { t } from '../i18n';

export type Torrent = components['schemas']['Torrent'];

/** 1536 -> "1.5 KB"; 0 -> "0 B". */
export function formatBytes(n: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) (n /= 1024), i++;
  return (i && n < 100 ? n.toFixed(1) : String(Math.round(n))) + ' ' + units[i];
}

export const stateLabel = (x: Torrent): string => {
  const s = t('torrents.state.' + (x.paused ? 'paused' : x.state));
  return x.state === 'downloading' && !x.paused ? `${s} ${Math.round(x.progress * 100)}%` : s;
};

/** "1.2 GB · ↓ 3.4 MB/s · ↑ 100 KB/s · 12/80" (size is "?" until the metadata is in). */
export const statsLine = (x: Torrent): string =>
  [x.size_bytes ? formatBytes(x.size_bytes) : '?', '↓ ' + formatBytes(x.download_rate) + '/s', '↑ ' + formatBytes(x.upload_rate) + '/s', x.seeds + '/' + x.peers].join(' · ');

/** What the list shows while a pause/resume/remove is in flight (null = hidden), until the server confirms. */
export type Overlay = Record<string, Partial<Torrent> | null>;

export function applyOverlay(list: Torrent[], o: Overlay): Torrent[] {
  const out: Torrent[] = [];
  for (const x of list) {
    const p = o[x.info_hash];
    if (p !== null) out.push(p ? { ...x, ...p } : x);
  }
  return out;
}

/** The two choices of the remove dialog; each reports the `delete_files` value to send. */
export function removeActions(choose: (deleteFiles: boolean) => void, cancel: () => void) {
  return [
    { label: t('torrents.remove_keep'), onPress: () => choose(false) }, // first: the safe choice gets the focus
    { label: t('torrents.remove_files'), onPress: () => choose(true) },
    { label: t('common.cancel'), onPress: cancel },
  ];
}

/** The row to focus when rows vanished: the next surviving one after the first gone row, else the previous, else null. */
export function neighbour(before: string[], after: string[]): string | null {
  const i = before.findIndex((h) => after.indexOf(h) < 0);
  if (i < 0) return null;
  const ok = (h: string) => after.indexOf(h) >= 0;
  return before.slice(i + 1).filter(ok)[0] || before.slice(0, i).filter(ok).pop() || null;
}

/** Drops the overlay entries the server's list now agrees with (hidden = gone, patched = same `paused`). */
export function pruneOverlay(list: Torrent[], o: Overlay): Overlay {
  const out: Overlay = {};
  for (const h in o) {
    const x = list.filter((y) => y.info_hash === h)[0];
    const p = o[h];
    if (p === null ? x : x && x.paused !== p.paused) out[h] = p;
  }
  return out;
}

/**
 * Runs `run` every `ms` after the previous run settled; never two at once. start() runs it at once
 * (unless one is in flight); stop() cancels the timer; a run that settles after stop() schedules nothing.
 */
export function createPoller(run: () => Promise<unknown>, ms = 3000) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inflight = false;
  let on = false;
  const settled = () => {
    inflight = false;
    if (on) timer = setTimeout(tick, ms);
  };
  const tick = () => {
    timer = undefined;
    if (!on || inflight) return;
    inflight = true;
    run().then(settled, settled);
  };
  return {
    start() {
      on = true;
      if (!inflight) (clearTimeout(timer), tick());
    },
    stop() {
      on = false;
      clearTimeout(timer);
      timer = undefined;
    },
  };
}
