import { render, type ComponentChild } from 'preact';
import { memo } from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';
import { FocusContext, GetBoundingClientRectAdapter, init, useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import './base.css';
import './ui/ui.css';
import { initKeys, onKey } from './nav/keys';
import { LayerContext, layerKey, stack, type Entry } from './nav/stack';
import { Sidebar, type Tab } from './ui/Sidebar';
import { ExitDialog } from './ui/Dialog';
import { Button } from './ui/Button';
import { ErrorView } from './ui/ErrorView';
import { Spinner } from './ui/Spinner';
import { initLanguage, language, onLanguageChange, t } from './i18n';
import { ApiError, errorText, get } from './api/client';
import { markBooted, openSetup, setupIsOpen, WaitingDialog } from './connection';
import { loadServer } from './settings';
import { Settings } from './screens/Settings';
import { Home } from './screens/Home';
import { Library, MediaTab, Tracker } from './screens/Browse';
import { setTracker } from './tracker';
import { ItemMenuHost } from './ui/ItemMenu';
import { Search } from './screens/Search';

// getBoundingClientRect so positions include the Row/Grid track transforms; throttle keeps held keys smooth on old TVs.
init({ layoutAdapter: GetBoundingClientRectAdapter, throttle: 80, throttleKeypresses: true });
initKeys();

/**
 * One stack entry. Lower entries stay mounted but hidden, so their state and focus keys survive a push.
 * `lang` is unused here: a new value makes memo re-render the whole layer after a language switch.
 */
const Layer = memo(function Layer({ entry, visible }: { entry: Entry; visible: boolean; lang: string }) {
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

const screens: Record<Tab, () => ComponentChild> = {
  home: () => <Home />,
  movies: () => <MediaTab key="movies" media="movies" />,
  shows: () => <MediaTab key="shows" media="shows" />,
  library: () => <Library />,
  tracker_movies: () => <Tracker key="movies" media="movies" />,
  tracker_shows: () => <Tracker key="shows" media="shows" />,
  search: () => <Search />,
  settings: () => <Settings />,
};

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
          {screens[tab]()}
        </div>
      </FocusContext.Provider>
      {exitOpen && <ExitDialog onClose={() => setExitOpen(false)} />}
    </div>
  );
}

/**
 * First screen: connects (Setup on first run or 401; network errors wait in the client's waiting dialog),
 * then replaces itself with Root.
 */
function Boot() {
  const [error, setError] = useState<unknown>(null);
  const connect = async () => {
    setError(null);
    for (;;) {
      if (!loadServer().ip) {
        await openSetup();
        continue;
      }
      try {
        setTracker((await get('/system/info')).tracker);
        // The server came up while Setup is open: let the user finish there, then connect with what was saved.
        if (!setupIsOpen()) break;
        await openSetup();
      } catch (e) {
        // The client already opened Setup on 401; openSetup returns that one.
        if (e instanceof ApiError && e.kind === 'unauthorized') await openSetup();
        else return setError(e);
      }
    }
    markBooted();
    stack.replace(() => <Root />);
  };
  useEffect(() => void connect(), []);
  if (!error) return <Spinner />;
  return (
    <ErrorView message={errorText(error)} onRetry={connect}>
      <Button label={t('waiting.change_server')} onPress={() => void openSetup().then(connect)} />
    </ErrorView>
  );
}

function App() {
  const [, rerender] = useState(0);
  useEffect(() => {
    const update = () => rerender((n) => n + 1);
    const offs = [stack.subscribe(update), onLanguageChange(update)];
    update(); // children's effects (Boot pushing Setup) ran before this subscription
    return () => offs.forEach((off) => off());
  }, []);
  const entries = stack.entries;
  return (
    <>
      {entries.map((e, i) => <Layer key={e.id} entry={e} visible={i === entries.length - 1} lang={language()} />)}
      <ItemMenuHost />
      <WaitingDialog />
    </>
  );
}

void initLanguage().then(() => {
  stack.push(() => <Boot />);
  render(<App />, document.getElementById('app')!);
});
