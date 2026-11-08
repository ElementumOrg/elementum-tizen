import { useContext, useEffect, useRef, useState } from 'preact/hooks';
import { reveal } from '../ui/reveal';
import { LayerContext } from '../nav/stack';
import { onKey } from '../nav/keys';
import { t } from '../i18n';
import type { Track, TrackKind } from '.';
import { currentRow, panelKey, type Cursor } from './tracks';

interface Props {
  audio: Track[];
  text: Track[];
  /** Applies a track at once; the panel stays open. */
  onPick(kind: TrackKind, index: number): void;
  onClose(): void;
  /** Column to start on: 0 audio, 1 subtitles. */
  col?: 0 | 1;
}

/** Right-side panel: Audio and Subtitles columns; it handles its own keys and swallows all others. */
export function TrackPanel({ audio, text, onPick, onClose, col = 0 }: Props) {
  const layer = useContext(LayerContext);
  const [cur, setCur] = useState<Cursor>({ col, row: currentRow(col ? 'text' : 'audio', col ? text : audio) });
  const live = useRef({ cur, audio, text, onPick, onClose });
  live.current = { cur, audio, text, onPick, onClose };
  const box = useRef<HTMLDivElement>(null);

  useEffect(
    () =>
      onKey((a) => {
        const s = live.current;
        const r = panelKey(s.cur, a, s.audio, s.text);
        if (!r.handled) return false;
        if (r.close) s.onClose();
        else if (r.pick) s.onPick(r.pick[0], r.pick[1]);
        else setCur(r.cursor);
        return true;
      }, { layer }),
    [],
  );
  useEffect(() => {
    const el = box.current && box.current.querySelector('.tp-sel');
    if (el) reveal(el as HTMLElement);
  }, [cur]);

  const column = (kind: TrackKind, col: 0 | 1, list: Track[]) => {
    const rows = kind === 'text' ? [{ index: -1, label: t('player.off'), current: !list.some((x) => x.current) }].concat(list) : list;
    return (
      <div class="tp-col">
        <h3>{t(kind === 'audio' ? 'player.audio' : 'player.subtitles')}</h3>
        <div class="tp-list">
          {rows.length === 0 && <div class="tp-row tp-none">{t('player.no_tracks')}</div>}
          {rows.map((r, i) => (
            <div key={r.index} class={'tp-row' + (r.current ? ' tp-cur' : '') + (cur.col === col && cur.row === i ? ' tp-sel' : '')}>
              {(r.current ? '● ' : '') + r.label}
            </div>
          ))}
        </div>
      </div>
    );
  };
  return (
    <div class="tp" ref={box}>
      {column('audio', 0, audio)}
      {column('text', 1, text)}
    </div>
  );
}
