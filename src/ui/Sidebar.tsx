import { FocusContext, useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { t } from '../i18n';

export const TABS = ['home', 'movies', 'shows', 'library', 'tracker', 'search', 'settings'] as const;
export type Tab = (typeof TABS)[number];

interface SidebarProps {
  current: Tab;
  onSelect: (tab: Tab) => void;
}

export function Sidebar({ current, onSelect }: SidebarProps) {
  // Entering the sidebar lands on the active tab, not on the last item focused.
  const { ref, focusKey } = useFocusable({
    focusKey: 'sidebar',
    saveLastFocusedChild: false,
    preferredChildFocusKey: `sidebar-${current}`,
  });
  return (
    <FocusContext.Provider value={focusKey}>
      <div ref={ref} class="sidebar">
        {TABS.map((tab) => <SidebarItem key={tab} tab={tab} active={tab === current} onSelect={onSelect} />)}
      </div>
    </FocusContext.Provider>
  );
}

function SidebarItem({ tab, active, onSelect }: { tab: Tab; active: boolean; onSelect: (tab: Tab) => void }) {
  const { ref, focused } = useFocusable({ focusKey: `sidebar-${tab}`, onEnterPress: () => onSelect(tab) });
  return (
    <div ref={ref} class={'sidebar-item' + (focused ? ' focused' : '') + (active ? ' active' : '')} onClick={() => onSelect(tab)}>
      {t(`nav.${tab}`)}
    </div>
  );
}
