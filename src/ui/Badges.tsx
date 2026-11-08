import { badgesOf, progressOf, type Badge, type ItemState } from './item-state';

// 24x24 paths, drawn white on a dark disc.
const ICON: Record<Badge, string> = {
  watched: 'M5 13l4 4L19 7',
  library: 'M4 5h4v14H4zM10 5h4v14h-4zM16 6l4 1-3 12-4-1z',
  collection: 'M3 7h18v12H3zM3 7l3-3h6l2 3',
  watchlist: 'M6 3h12v18l-6-4-6 4z',
};

/** Corner icons (watched, library, collection, watchlist), a "n/total" count for a part-watched season, and a progress bar. */
export function Badges({ state, total }: { state: ItemState; total?: number }) {
  const list = badgesOf(state);
  const n = state.watched_episodes;
  const partial = state.watched !== true && total && n && n > 0 ? `${n}/${total}` : '';
  const bar = progressOf(state.progress);
  if (!list.length && !partial && !bar) return null;
  return (
    <>
      <div class="sbadges">
        {partial && <span class="sbadge count">{partial}</span>}
        {list.map((b) => (
          <svg key={b} class={'sbadge ' + b} viewBox="0 0 24 24" width="36" height="36">
            <path d={ICON[b]} fill={b === 'watched' ? 'none' : '#fff'} stroke="#fff" stroke-width={b === 'watched' ? 3 : 1.5} stroke-linejoin="round" stroke-linecap="round" />
          </svg>
        ))}
      </div>
      {bar > 0 && <div class="pbar"><i style={`width:${Math.round(bar * 100)}%`} /></div>}
    </>
  );
}
