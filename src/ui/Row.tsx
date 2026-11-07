import { useEffect } from 'preact/hooks';
import { FocusContext, useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { useClaimFocus } from '../nav/focus';
import { Poster, useList, type PosterItem } from './Poster';

const STRIDE = 264; // poster width 240 + 24 margin, keep in sync with ui.css
const BEFORE = 2; // cells kept left of focus (off-screen, so Left has a target)
const AFTER = 13; // cells right of focus; ~6.5 are visible

interface RowProps<T extends PosterItem> {
  /** Defaults to a generated key, which is unique even when the same screen is pushed twice. */
  focusKey?: string;
  title?: string;
  items: T[];
  onSelect: (item: T, index: number) => void;
  onEndReached?: () => void;
}

/** Horizontal poster row; the focused poster stays at the left edge and only ~15 cells are in the DOM. */
export function Row<T extends PosterItem>({ focusKey, title, items, onSelect, onEndReached }: RowProps<T>) {
  const { ref, focusKey: key, focusSelf, hasFocusedChild } = useFocusable({ focusKey, trackChildren: true });
  useClaimFocus(key, focusSelf);
  const { index, onItemFocus, onItemSelect } = useList(items, onSelect, onEndReached, 6);

  // Bring the row into view when focus enters it from another row.
  useEffect(() => {
    if (hasFocusedChild) (ref.current as HTMLElement).scrollIntoView(true);
  }, [hasFocusedChild]);

  const cells = [];
  for (let i = Math.max(0, index - BEFORE), end = Math.min(items.length, index + AFTER); i < end; i++) {
    cells.push(
      <Poster key={i} item={items[i]} focusKey={`${key}-${i}`} index={i} left={i * STRIDE} top={0}
        onFocus={onItemFocus} onSelect={onItemSelect} />,
    );
  }
  return (
    <FocusContext.Provider value={key}>
      <div ref={ref} class="row">
        {title && <h2>{title}</h2>}
        <div class="row-viewport">
          <div class="track" style={`transform:translate3d(${-index * STRIDE}px,0,0)`}>{cells}</div>
        </div>
      </div>
    </FocusContext.Provider>
  );
}
