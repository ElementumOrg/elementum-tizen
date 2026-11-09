import { FocusContext, useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { useEffect, useRef } from 'preact/hooks';
import { t } from '../i18n';
import { debounce } from './debounce';
import { trackerName } from '../tracker';

export const TABS = ['home', 'movies', 'shows', 'library', 'torrents', 'tracker_movies', 'tracker_shows', 'search', 'settings'] as const;
export type Tab = (typeof TABS)[number];

/** Focus must rest this long on an entry before its screen loads. */
export const SWITCH_DELAY = 400;

// 24x24 outline icons, drawn with currentColor.
const ICONS: Record<Tab, string> = {
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  movies: 'M3 5h18v14H3zM7 5v14M17 5v14M3 9h4M3 15h4M17 9h4M17 15h4',
  shows: 'M3 7h18v13H3zM8 2l4 5 4-5',
  library: 'M4 4v16M9 4v16M14 5l5 15',
  torrents: 'M12 3v12M7 10l5 5 5-5M4 20h16',
  tracker_movies: 'M5 3h14v18l-7-5-7 5zM9 9l5 0',
  tracker_shows: 'M5 3h14v18l-7-5-7 5zM8 8h8',
  search: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM15 15l6 6',
  settings: 'M4 7h10M18 7h2M4 17h2M10 17h10M16 4v6M8 14v6',
};

interface SidebarProps {
  current: Tab;
  onSelect: (tab: Tab) => void;
}

const label = (tab: Tab) =>
  tab === 'tracker_movies' || tab === 'tracker_shows'
    ? t(tab === 'tracker_movies' ? 'tracker.movies' : 'tracker.shows', { name: trackerName() })
    : t(`nav.${tab}`);


export function Sidebar({ current, onSelect }: SidebarProps) {
  // Entering the sidebar lands on the active tab, not on the last item focused.
  const { ref, focusKey } = useFocusable({
    focusKey: 'sidebar',
    saveLastFocusedChild: false,
    preferredChildFocusKey: `sidebar-${current}`,
  });
  const latest = useRef(onSelect);
  latest.current = onSelect;
  const pending = useRef(debounce((tab: Tab) => latest.current(tab), SWITCH_DELAY)).current;
  const cancel = pending.cancel;
  // A tab change by any path (Back, Enter) and unmount drop the pending switch.
  useEffect(() => cancel, [current]);
  const select = (tab: Tab) => (cancel(), onSelect(tab));
  // Focus staying on an entry switches to it; passing over entries doesn't.
  const settle = (tab: Tab) => (tab === current ? cancel() : pending.call(tab));
  return (
    <FocusContext.Provider value={focusKey}>
      <div ref={ref} class="sidebar">
        {TABS.map((tab) => <SidebarItem key={tab} tab={tab} active={tab === current} onSelect={select} onSettle={settle} onLeave={cancel} />)}
      </div>
    </FocusContext.Provider>
  );
}

interface ItemProps {
  tab: Tab;
  active: boolean;
  onSelect: (tab: Tab) => void;
  onSettle: (tab: Tab) => void;
  onLeave: () => void;
}

function SidebarItem({ tab, active, onSelect, onSettle, onLeave }: ItemProps) {
  const { ref, focused } = useFocusable({
    focusKey: `sidebar-${tab}`,
    onEnterPress: () => onSelect(tab),
    onFocus: () => onSettle(tab),
    onBlur: onLeave,
  });
  return (
    <div ref={ref} class={'sidebar-item' + (focused ? ' focused' : '') + (active ? ' active' : '')} onClick={() => onSelect(tab)}>
      <svg class="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d={ICONS[tab]} />
      </svg>
      <span>{label(tab)}</span>
    </div>
  );
}
