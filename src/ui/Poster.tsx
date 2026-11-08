import { memo } from 'preact/compat';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { createLongPress } from '../nav/longpress';
import { Badges } from './Badges';
import { openItemMenu } from './ItemMenu';
import { useItemState, type ItemState, type Ref } from './item-state';

/** The fields a poster needs; API `MediaItem` already has this shape. */
export interface PosterItem extends ItemState {
  /** A movie or show from the API (`MediaItem`) is addressed by these. */
  type?: string;
  tmdb_id?: number;
  /** Season posters: what to address and how many episodes there are. Set it to enable the long-press menu. */
  ref?: Ref;
  title: string;
  poster?: string | null;
  /** Second line; when set, the title and caption stay visible over the bottom of the image (cast, seasons). */
  caption?: string;
}

interface PosterProps {
  item: PosterItem;
  focusKey: string;
  index: number;
  left: number;
  top: number;
  onFocus: (index: number) => void;
  onSelect: (index: number) => void;
}

// Wait before loading the image so holding an arrow key doesn't fetch every poster it passes.
const IMAGE_DELAY_MS = 150;

/** memo: a Row/Grid re-render on focus change only renders cells whose props changed. */
export const Poster = memo(function Poster({ item, focusKey, index, left, top, onFocus, onSelect }: PosterProps) {
  const target: Ref | undefined = item.ref || (item.tmdb_id && (item.type === 'movie' || item.type === 'show') ? { kind: item.type, tmdb_id: item.tmdb_id } : undefined);
  const state = useItemState(target, item);
  // Items with a menu act on release (a long press must not open them); others on press, as before.
  const live = useRef({ state, target, index, onSelect });
  live.current = { state, target, index, onSelect };
  const press = useRef(createLongPress(
    () => live.current.onSelect(live.current.index),
    () => openItemMenu(live.current.target!, live.current.state),
  )).current;
  const { ref, focused } = useFocusable({
    focusKey,
    onFocus: () => onFocus(index),
    onEnterPress: () => (target ? press.press() : onSelect(index)),
    onEnterRelease: () => target && press.release(),
  });
  const [src, setSrc] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setLoaded(false);
    if (!item.poster) return setSrc(null);
    const timer = setTimeout(() => setSrc(item.poster!), IMAGE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [item.poster]);

  return (
    <div
      ref={ref}
      class={'poster' + (focused ? ' focused' : '') + (item.caption ? ' captioned' : '')}
      style={`left:${left}px;top:${top}px`}
      onClick={() => onSelect(index)}
    >
      {/* The title stays underneath; it shows until the image loads, and if it never does. */}
      <span class="poster-title">{item.title}{item.caption && <small>{item.caption}</small>}</span>
      <Badges state={state} total={item.ref && item.ref.total} />
      {src && <img src={src} alt="" class={loaded ? 'loaded' : ''} onLoad={() => setLoaded(true)} />}
    </div>
  );
});

/** Shared state for Row and Grid: focused index, stable cell callbacks, and paging. */
export function useList<T>(
  items: T[],
  onSelect: (item: T, index: number) => void,
  onEndReached: (() => void) | undefined,
  threshold: number,
  start = 0,
) {
  const [rawIndex, setIndex] = useState(start);
  // The list may shrink or be replaced; keep the window inside it.
  const index = Math.min(rawIndex, Math.max(0, items.length - 1));
  const latest = useRef({ items, onSelect, onEndReached });
  latest.current = { items, onSelect, onEndReached };
  const onItemFocus = useCallback((i: number) => setIndex(i), []);
  const onItemSelect = useCallback((i: number) => latest.current.onSelect(latest.current.items[i], i), []);

  // The pager ignores calls while loading, so a failed page is retried by the next focus move near the end.
  useEffect(() => {
    if (onEndReached && index >= items.length - threshold) onEndReached();
  }, [index, items.length]);

  return { index, onItemFocus, onItemSelect };
}
