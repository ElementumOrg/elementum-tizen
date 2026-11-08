// Paging for Row/Grid screens: one request at a time, stops at total_pages.
import { useEffect, useRef, useState } from 'preact/hooks';
import { apiLang } from '../i18n';

export interface Page<T> {
  items: T[];
  total_pages: number;
}
/** The client's Request fits: a promise with an optional abort. */
export type FetchPage<T> = (page: number) => Promise<Page<T>> & { abort?(): void };

export interface PagerState<T> {
  items: T[];
  loading: boolean;
  error: unknown;
  done: boolean;
}

export function createPager<T>(fetchPage: FetchPage<T>, onChange: (s: PagerState<T>) => void) {
  let state: PagerState<T> = { items: [], loading: false, error: null, done: false };
  let next = 1;
  let req: ReturnType<FetchPage<T>> | null = null;
  let disposed = false;
  const set = (patch: Partial<PagerState<T>>) => {
    state = { ...state, ...patch };
    onChange(state);
  };

  function more() {
    if (state.loading || state.done || disposed) return;
    set({ loading: true, error: null });
    const r = (req = fetchPage(next));
    r.then(
      (p) => {
        if (disposed) return;
        next++;
        set({ items: p.items.length ? state.items.concat(p.items) : state.items, loading: false, done: next > p.total_pages });
        // Pages can be short or empty (unresolvable tracker items); an empty one doesn't move the list's end,
        // so the view won't ask again: fetch on until something arrives or total_pages is reached.
        if (!p.items.length) more();
      },
      (error) => {
        if (!disposed) set({ loading: false, error });
      },
    );
  }

  return {
    more,
    get state() {
      return state;
    },
    dispose() {
      disposed = true;
      if (req && req.abort) req.abort();
    },
  };
}

/**
 * Loads page 1 on mount, more on `more()` (Row/Grid onEndReached; also the Retry after an error).
 * Starts over when the app language changes; give the component a new `key` to start over on anything else.
 */
export function usePaged<T>(fetchPage: FetchPage<T>) {
  const [state, setState] = useState<PagerState<T>>({ items: [], loading: true, error: null, done: false });
  const pager = useRef<ReturnType<typeof createPager<T>> | null>(null);
  const lang = apiLang();
  useEffect(() => {
    const p = (pager.current = createPager(fetchPage, setState));
    p.more();
    return p.dispose;
  }, [lang]);
  return { ...state, more: () => pager.current && pager.current.more() };
}
