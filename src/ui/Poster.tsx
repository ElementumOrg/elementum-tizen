import { memo } from 'preact/compat';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';

/** The fields a poster needs; API `MediaItem` already has this shape. */
export interface PosterItem {
  title: string;
  poster?: string | null;
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
  const { ref, focused } = useFocusable({
    focusKey,
    onFocus: () => onFocus(index),
    onEnterPress: () => onSelect(index),
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
      class={focused ? 'poster focused' : 'poster'}
      style={`left:${left}px;top:${top}px`}
      onClick={() => onSelect(index)}
    >
      {/* The title stays underneath; it shows until the image loads, and if it never does. */}
      <span class="poster-title">{item.title}</span>
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
) {
  const [rawIndex, setIndex] = useState(0);
  // The list may shrink or be replaced; keep the window inside it.
  const index = Math.min(rawIndex, Math.max(0, items.length - 1));
  const latest = useRef({ items, onSelect, onEndReached });
  latest.current = { items, onSelect, onEndReached };
  const onItemFocus = useCallback((i: number) => setIndex(i), []);
  const onItemSelect = useCallback((i: number) => latest.current.onSelect(latest.current.items[i], i), []);

  // Ask once per list length, so a slow page load isn't requested twice.
  const askedAt = useRef(-1);
  useEffect(() => {
    if (onEndReached && index >= items.length - threshold && askedAt.current !== items.length) {
      askedAt.current = items.length;
      onEndReached();
    }
  }, [index, items.length]);

  return { index, onItemFocus, onItemSelect };
}
