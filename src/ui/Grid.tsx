import { FocusContext, useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { useClaimFocus } from '../nav/focus';
import { Poster, useList, type PosterItem } from './Poster';

const COL = 264; // poster width 240 + 24 margin, keep in sync with ui.css
const ROW = 400; // poster height 360 + 40 margin

interface GridProps<T extends PosterItem> {
  /** Defaults to a generated key, which is unique even when the same screen is pushed twice. */
  focusKey?: string;
  items: T[];
  columns?: number;
  onSelect: (item: T, index: number) => void;
  onEndReached?: () => void;
}

/** Vertical poster grid; the focused row stays second from the top and only 4 rows are in the DOM. */
export function Grid<T extends PosterItem>({ focusKey, items, columns = 6, onSelect, onEndReached }: GridProps<T>) {
  const { ref, focusKey: key, focusSelf } = useFocusable({ focusKey });
  useClaimFocus(key, focusSelf);
  const { index, onItemFocus, onItemSelect } = useList(items, onSelect, onEndReached, columns * 2);
  const row = Math.floor(index / columns);

  const cells = [];
  for (let i = Math.max(0, row - 1) * columns, end = Math.min(items.length, (row + 3) * columns); i < end; i++) {
    cells.push(
      <Poster key={i} item={items[i]} focusKey={`${key}-${i}`} index={i}
        left={(i % columns) * COL} top={Math.floor(i / columns) * ROW}
        onFocus={onItemFocus} onSelect={onItemSelect} />,
    );
  }
  return (
    <FocusContext.Provider value={key}>
      <div ref={ref} class="grid">
        <div class="track" style={`transform:translate3d(0,${-Math.max(0, row - 1) * ROW}px,0)`}>{cells}</div>
      </div>
    </FocusContext.Provider>
  );
}
