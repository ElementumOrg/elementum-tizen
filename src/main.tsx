import { render } from 'preact';
import { memo } from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';
import { FocusContext, GetBoundingClientRectAdapter, init, useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import './base.css';
import './ui/ui.css';
import { initKeys, onKey } from './nav/keys';
import { exitApp, LayerContext, layerKey, stack, type Entry } from './nav/stack';
import { Sidebar, type Tab } from './ui/Sidebar';
import { Dialog } from './ui/Dialog';
import { t } from './i18n';
import { demoScreens } from './demo';

// getBoundingClientRect so positions include the Row/Grid track transforms; throttle keeps held keys smooth on old TVs.
init({ layoutAdapter: GetBoundingClientRectAdapter, throttle: 80, throttleKeypresses: true });
initKeys();

/** One stack entry. Lower entries stay mounted but hidden, so their state and focus keys survive a push. */
const Layer = memo(function Layer({ entry, visible }: { entry: Entry; visible: boolean }) {
  const { ref, focusKey, focusSelf } = useFocusable({
    focusKey: layerKey(entry.id),
    isFocusBoundary: true,
    preferredChildFocusKey: 'content',
  });
  useEffect(() => focusSelf(), []);
  return (
    <LayerContext.Provider value={entry.id}>
      <FocusContext.Provider value={focusKey}>
        <div ref={ref} class="layer" style={visible ? '' : 'display:none'}>
          {entry.view()}
        </div>
      </FocusContext.Provider>
    </LayerContext.Provider>
  );
});

/** Root screen: sidebar + the current tab. Owns Back for every layer (global): pop, else go to Home, else ask to exit. */
function Root() {
  const [tab, setTab] = useState<Tab>('home');
  const [exitOpen, setExitOpen] = useState(false);
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const content = useFocusable({ focusKey: 'content' });

  useEffect(
    () =>
      onKey((action) => {
        if (action !== 'back') return false;
        if (stack.pop()) return true;
        // Focus inside the old tab is lost on unmount; norigin then restores it to the new tab's content.
        if (tabRef.current !== 'home') setTab('home');
        else setExitOpen(true);
        return true;
      }, { global: true }),
    [],
  );

  return (
    <div class="root">
      <Sidebar current={tab} onSelect={setTab} />
      <FocusContext.Provider value={content.focusKey}>
        <div ref={content.ref} class="content">
          {demoScreens[tab]()}
        </div>
      </FocusContext.Provider>
      {exitOpen && (
        <Dialog
          title={t('exit.title')}
          onClose={() => setExitOpen(false)}
          actions={[
            { label: t('common.no'), onPress: () => setExitOpen(false) },
            { label: t('common.yes'), onPress: () => (exitApp(), setExitOpen(false)) }, // closes in a browser
          ]}
        />
      )}
    </div>
  );
}

function App() {
  const [, rerender] = useState(0);
  useEffect(() => stack.subscribe(() => rerender((n) => n + 1)), []);
  const entries = stack.entries;
  return <>{entries.map((e, i) => <Layer key={e.id} entry={e} visible={i === entries.length - 1} />)}</>;
}

stack.push(() => <Root />);
render(<App />, document.getElementById('app')!);
