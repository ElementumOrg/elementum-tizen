import { useEffect } from 'preact/hooks';
import { FocusContext, useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { useClaimFocus } from '../nav/focus';
import { Poster, useList, type PosterItem } from './Poster';

const STRIDE = 264; // poster width 240 + 24 margin, keep in sync with ui.css
const WIDE_STRIDE = 504; // .row.wide poster width 480 + 24 margin
const BEFORE = 2; // cells kept left of focus (off-screen, so Left has a target)
const VISIBLE = 6; // posters on screen (3 wide cells)
const AFTER = 13; // cells right of focus; ~6.5 are visible

interface RowProps<T extends PosterItem> {
  /** Defaults to a generated key, which is unique even when the same screen is pushed twice. */
  focusKey?: string;
  title?: string;
  items: T[];
  onSelect: (item: T, index: number) => void;
  onEndReached?: () => void;
  /** 16:9 cells (image gallery) instead of posters. */
  wide?: boolean;
  /** false: don't take focus on mount (a parent claims it instead). */
  claim?: boolean;
  /** Index focused first (the window starts there). */
  start?: number;
}

/** Horizontal poster row; the focused poster stays at the left edge and only ~15 cells are in the DOM. */
export function Row<T extends PosterItem>({ focusKey, title, items, onSelect, onEndReached, wide, claim, start }: RowProps<T>) {
  const { ref, focusKey: key, focusSelf, hasFocusedChild } = useFocusable({ focusKey, trackChildren: true });
  useClaimFocus(key, claim === false ? () => {} : focusSelf);
  const { index, onItemFocus, onItemSelect } = useList(items, onSelect, onEndReached, 6, start);

  // Bring the row into view when focus enters it from another row.
  useEffect(() => {
    if (hasFocusedChild) (ref.current as HTMLElement).scrollIntoView(true);
  }, [hasFocusedChild]);

  const stride = wide ? WIDE_STRIDE : STRIDE;
  // Never scroll past the point where the last item reaches the right edge: short rows stay at the left.
  const shown = wide ? 3 : VISIBLE;
  const offset = Math.max(0, Math.min(index, items.length - shown));
  const cells = [];
  for (let i = Math.max(0, index - BEFORE), end = Math.min(items.length, index + AFTER); i < end; i++) {
    cells.push(
      <Poster key={i} item={items[i]} focusKey={`${key}-${i}`} index={i} left={i * stride} top={0}
        onFocus={onItemFocus} onSelect={onItemSelect} />,
    );
  }
  return (
    <FocusContext.Provider value={key}>
      <div ref={ref} class={wide ? 'row wide' : 'row'}>
        {title && <h2>{title}</h2>}
        <div class="row-viewport">
          <div class="track" style={`transform:translate3d(${-offset * stride}px,0,0)`}>{cells}</div>
        </div>
      </div>
    </FocusContext.Provider>
  );
}
