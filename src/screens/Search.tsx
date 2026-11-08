// Search: a text field and a movie/show toggle over a PagedGrid. Each new query remounts the grid, which aborts
// the previous request (the pager aborts on dispose).
import { useContext, useEffect, useRef, useState } from 'preact/hooks';
import { FocusContext, getCurrentFocusKey, setFocus, useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { get } from '../api/client';
import { apiLang, t } from '../i18n';
import { LayerContext } from '../nav/stack';
import { onKey } from '../nav/keys';
import { addRecent, loadRecent, saveRecent } from '../settings';
import { Button } from '../ui/Button';
import { debounce } from '../ui/debounce';
import { LIMIT, PagedGrid } from '../ui/Paged';
import { TextField } from '../ui/TextField';
import { openDetails } from './Details';

export const DEBOUNCE_MS = 600;
const MIN_CHARS = 2;
const FIELD = 'search-field';
let searchType: 'movie' | 'show' = 'movie';

export function Search() {
  const [value, setValue] = useState('');
  const [q, setQ] = useState(''); // the query being shown; '' = none
  const [type, setType] = useState(searchType);
  const [recent, setRecent] = useState(loadRecent);
  const layer = useContext(LayerContext);
  const { ref, focusKey, hasFocusedChild } = useFocusable({ trackChildren: true });
  const inside = useRef(hasFocusedChild);
  inside.current = hasFocusedChild;

  const deb = useRef<ReturnType<typeof debounce<[string]>> | null>(null);
  const commit = (v: string) => setQ(v.trim().length >= MIN_CHARS ? v.trim() : '');
  const typing = (deb.current = deb.current || debounce(commit, DEBOUNCE_MS));
  const remember = (v: string) => {
    const r = addRecent(recent, v);
    setRecent(r);
    saveRecent(r);
  };
  const run = (v: string) => {
    setValue(v);
    typing.cancel();
    commit(v);
    if (v.trim().length >= MIN_CHARS) remember(v.trim());
  };
  useEffect(() => typing.cancel, []);
  // Back from anywhere below the field returns to it; from the field it falls through to the shell (Home).
  useEffect(
    () =>
      onKey((action) => {
        if (action !== 'back' || !inside.current || getCurrentFocusKey() === FIELD) return false;
        setFocus(FIELD);
        return true;
      }, { layer }),
    [layer],
  );

  const fetchPage = (page: number) =>
    get('/search', { query: { query: q, type, page, limit: LIMIT, lang: apiLang() } });
  return (
    <div class="screen search">
      <h1>{t('nav.search')}</h1>
      <FocusContext.Provider value={focusKey}>
        <div ref={ref} class="screen-body">
          <div class="search-bar">
            <TextField focusKey={FIELD} label={t('search.field')} value={value} onSubmit={run}
              onInput={(v) => (setValue(v), setQ(''), typing.call(v))} />
            <Button label={t(type === 'movie' ? 'nav.movies' : 'nav.shows')}
              onPress={() => setType((searchType = type === 'movie' ? 'show' : 'movie'))} />
          </div>
          {value.trim() ? (
            q ? (
              <div class="search-results"><PagedGrid key={q + type} fetchPage={fetchPage} empty={t('search.none', { q })}
                onSelect={(item) => (remember(q), openDetails(item))} /></div>
            ) : (
              <p class="empty">{t('search.hint')}</p>
            )
          ) : recent.length ? (
            <div>
              <h2 class="chips-title">{t('search.recent')}</h2>
              <div class="chips">
                {recent.map((r) => <Button key={r} label={r} onPress={() => run(r)} />)}
                <Button label={t('search.clear')} onPress={() => (setRecent([]), saveRecent([]))} />
              </div>
            </div>
          ) : (
            <p class="empty">{t('search.hint')}</p>
          )}
        </div>
      </FocusContext.Provider>
    </div>
  );
}
