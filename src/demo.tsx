// B4 demo screens with fake data. B5–B7 replace this file with real screens (src/screens/).
import type { ComponentChild } from 'preact';
import { useState } from 'preact/hooks';
import { stack } from './nav/stack';
import type { Tab } from './ui/Sidebar';
import { Row } from './ui/Row';
import { Grid } from './ui/Grid';
import { Button } from './ui/Button';
import { Spinner } from './ui/Spinner';
import { ErrorView } from './ui/ErrorView';
import { Dialog } from './ui/Dialog';
import type { PosterItem } from './ui/Poster';

const COLORS = ['#7a2f3b', '#2f5d7a', '#3b7a2f', '#6b4f8f', '#8f6f2f'];

function fake(prefix: string, from: number, count: number, withImage = true): PosterItem[] {
  const out: PosterItem[] = [];
  for (let i = from; i < from + count; i++) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="360"><rect width="240" height="360" fill="${COLORS[i % 5]}"/><text x="20" y="320" font-size="40" fill="#fff" font-family="Arial">${prefix} ${i + 1}</text></svg>`;
    out.push({ title: `${prefix} ${i + 1}`, poster: withImage ? 'data:image/svg+xml,' + encodeURIComponent(svg) : null });
  }
  return out;
}

/** Fake paged list: 20 more items per onEndReached, up to `max`. */
function usePaged(prefix: string, first: number, max: number) {
  const [items, setItems] = useState(() => fake(prefix, 0, first));
  const more = () => items.length < max && setTimeout(() => setItems((cur) => cur.concat(fake(prefix, cur.length, 20))), 300);
  return [items, more] as const;
}

const openDetails = (item: PosterItem) => stack.push(() => <Details item={item} />);

function Home() {
  const [movies, moreMovies] = usePaged('Movie', 30, 200);
  // Stable arrays: a new array would re-render every cell.
  const [shows] = useState(() => fake('Show', 0, 25));
  const [watchlist] = useState(() => fake('No image', 0, 8, false));
  return (
    <div class="screen">
      <Row title="Trending movies (paged)" items={movies} onSelect={openDetails} onEndReached={moreMovies} />
      <Row title="Trending shows" items={shows} onSelect={openDetails} />
      <Row title="Watchlist (title fallback)" items={watchlist} onSelect={openDetails} />
    </div>
  );
}

function GridScreen({ title }: { title: string }) {
  const [items, more] = usePaged(title, 40, 300);
  return (
    <div class="screen">
      <h1>{title}</h1>
      <Grid items={items} onSelect={openDetails} onEndReached={more} />
    </div>
  );
}

function Library() {
  const [state, setState] = useState<'error' | 'loading' | 'ok'>('error');
  const retry = () => {
    setState('loading');
    setTimeout(() => setState('ok'), 800);
  };
  if (state === 'error') return <ErrorView message="Could not load the library (demo error)." onRetry={retry} />;
  if (state === 'loading') return <Spinner />;
  return <GridScreen title="Library" />;
}

function Placeholder({ title }: { title: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div class="screen">
      <h1>{title}</h1>
      <p style="margin-left:24px">Demo screen. Elementum v{__APP_VERSION__}</p>
      <div style="margin-left:24px">
        <Button label="Open dialog" onPress={() => setOpen(true)} />
      </div>
      {open && <Dialog title="Demo dialog" onClose={() => setOpen(false)} actions={[{ label: 'OK', onPress: () => setOpen(false) }]} />}
    </div>
  );
}

function Details({ item }: { item: PosterItem }) {
  const [similar] = useState(() => fake('Similar', 0, 30));
  const [dialog, setDialog] = useState(false);
  return (
    <div class="screen" style="padding-left:40px">
      <h1>{item.title}</h1>
      <p style="margin-left:24px">Pushed demo details screen. Back returns to the poster you came from.</p>
      <div style="margin:0 0 40px 24px">
        <Button label="Find streams" onPress={() => stack.push(() => <Details item={{ title: item.title + ' / streams' }} />)} />
        <Button label="Back" onPress={() => stack.pop()} />
        {/* Tests a Dialog that opens while this screen is hidden under a pushed one. */}
        <Button label="Dialog in 2 s" onPress={() => setTimeout(() => setDialog(true), 2000)} />
      </div>
      {dialog && <Dialog title="Delayed dialog" onClose={() => setDialog(false)} actions={[{ label: 'OK', onPress: () => setDialog(false) }]} />}
      <Row title="More like this" items={similar} onSelect={openDetails} />
    </div>
  );
}

export const demoScreens: Record<Tab, () => ComponentChild> = {
  home: () => <Home />,
  movies: () => <GridScreen title="Movies" />,
  shows: () => <GridScreen title="Shows" />,
  library: () => <Library />,
  tracker: () => <GridScreen title="Tracker" />,
  search: () => <Placeholder title="Search" />,
  settings: () => <Placeholder title="Settings" />,
};
