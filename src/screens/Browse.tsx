// Movies, TV Shows, Library and the tracker's Movies/Shows: a toolbar of switchers over a PagedGrid.
import { useState } from 'preact/hooks';
import { get } from '../api/client';
import type { components } from '../api/schema';
import { apiLang, t } from '../i18n';
import { Button } from '../ui/Button';
import { trackerName } from '../tracker';
import { Dialog } from '../ui/Dialog';
import { LIMIT, PagedGrid, Picker, tick } from '../ui/Paged';
import type { FetchPage } from '../ui/pager';
import type { MediaItem } from '../ui/Paged';

type MovieList = components['schemas']['MovieListName'];
type ShowList = components['schemas']['ShowListName'];
type Media = 'movies' | 'shows';
type Fetch = FetchPage<MediaItem>;
const q = (page: number) => ({ page, limit: LIMIT, lang: apiLang() });
const mediaLabel = (m: Media) => t(`nav.${m}`);
const other = (m: Media): Media => (m === 'movies' ? 'shows' : 'movies');

interface Choice {
  label: string;
  /** Picker choices that need a second step (genres, user lists) carry their own label. */
  action: () => void;
}

/** A button that opens a dialog of choices. */
function Chooser({ label, title, choices }: { label: string; title: string; choices: Choice[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button label={label} onPress={() => setOpen(true)} />
      {open && (
        <Dialog title={title} onClose={() => setOpen(false)}
          actions={choices.map((c) => ({ label: c.label, onPress: () => (setOpen(false), c.action()) }))} />
      )}
    </>
  );
}

// ---- Movies / TV Shows ----

interface ListChoice {
  list: string;
  genre?: { id: number; name: string };
}
// Remembered per tab for the session (main.tsx keys MediaTab by media, so each tab remounts and reads its own).
const chosen: Record<Media, ListChoice> = { movies: { list: 'popular' }, shows: { list: 'popular' } };
const LISTS: Record<Media, string[]> = {
  movies: ['popular', 'trending', 'top_rated', 'now_playing', 'upcoming'],
  shows: ['popular', 'trending', 'top_rated', 'on_the_air'],
};

export function MediaTab({ media }: { media: Media }) {
  const [cur, setCur] = useState(chosen[media]);
  const [genres, setGenres] = useState(false);
  const pick = (c: ListChoice) => setCur((chosen[media] = c));
  const name = cur.genre ? cur.genre.name : t(`list.${cur.list}`);
  const fetchPage: Fetch = (page) => {
    const query = { ...q(page), genre: cur.genre && cur.genre.id };
    return media === 'movies'
      ? get('/movies/lists/{list}', { path: { list: cur.list as MovieList }, query })
      : get('/shows/lists/{list}', { path: { list: cur.list as ShowList }, query });
  };
  const choices = LISTS[media].map((l) => ({ label: tick(t(`list.${l}`), cur.list === l), action: () => pick({ list: l }) }));
  choices.push({ label: tick(t('list.genres'), cur.list === 'by_genre'), action: () => setGenres(true) });
  return (
    <div class="screen">
      <h1>{mediaLabel(media)}</h1>
      <div class="toolbar">
        <Chooser label={name} title={t('browse.list')} choices={choices} />
      </div>
      <PagedGrid key={cur.list + (cur.genre ? cur.genre.id : '')} fetchPage={fetchPage} />
      {genres && (
        <Picker title={t('list.genres')} onClose={() => setGenres(false)}
          load={() => get(media === 'movies' ? '/movies/genres' : '/shows/genres', { query: { lang: apiLang() } })}
          onPick={(g) => pick({ list: 'by_genre', genre: g })} />
      )}
    </div>
  );
}

// ---- Library ----

let libraryMedia: Media = 'movies';

export function Library() {
  const [media, setMedia] = useState(libraryMedia);
  const fetchPage: Fetch = (page) => get(media === 'movies' ? '/library/movies' : '/library/shows', { query: q(page) });
  return (
    <div class="screen">
      <h1>{t('nav.library')}</h1>
      <div class="toolbar">
        <Button label={mediaLabel(media)} onPress={() => setMedia((libraryMedia = other(media)))} />
      </div>
      <PagedGrid key={media} fetchPage={fetchPage} empty={t('library.empty')} />
    </div>
  );
}

// ---- Tracker ----

const CHARTS = ['trending', 'popular', 'anticipated', 'watched', 'played'] as const;
type Source = { kind: 'watchlist' | 'collection' } | { kind: 'chart'; chart: (typeof CHARTS)[number] } | { kind: 'list'; id: string; name: string };
const sourceName = (s: Source) =>
  s.kind === 'list' ? s.name : s.kind === 'chart' ? t('tracker.chart', { name: t(`chart.${s.chart}`) }) : t(`tracker.${s.kind}`);
const sourceKey = (s: Source) => (s.kind === 'chart' ? s.chart : s.kind === 'list' ? s.id : s.kind);
const gridKey = (s: Source) => s.kind + ':' + sourceKey(s);
let trackerSource: Source = { kind: 'watchlist' };

export function Tracker({ media }: { media: Media }) {
  const [src, setSrc] = useState(trackerSource);
  const [lists, setLists] = useState(false);
  const pick = (s: Source) => setSrc((trackerSource = s));
  const fetchPage: Fetch = (page) => {
    const query = q(page);
    if (src.kind === 'list') return get('/tracker/lists/{list_id}/items', { path: { list_id: src.id }, query: { ...query, media } });
    if (src.kind === 'chart') return get('/trakt/{media}/lists/{list}', { path: { media, list: src.chart }, query });
    return get(src.kind === 'watchlist' ? '/tracker/{media}/watchlist' : '/tracker/{media}/collection', { path: { media }, query });
  };
  const choices: Choice[] = [];
  for (const kind of ['watchlist', 'collection'] as const) {
    choices.push({ label: tick(sourceName({ kind }), src.kind === kind), action: () => pick({ kind }) });
  }
  choices.push({ label: tick(t('tracker.my_lists'), src.kind === 'list'), action: () => setLists(true) });
  for (const chart of CHARTS) {
    const s: Source = { kind: 'chart', chart };
    choices.push({ label: tick(sourceName(s), src.kind === 'chart' && src.chart === chart), action: () => pick(s) });
  }
  return (
    <div class="screen">
      <h1>{t(`tracker.${media}`, { name: trackerName() })}</h1>
      <div class="toolbar">
        <Chooser label={sourceName(src)} title={t('browse.list')} choices={choices} />
      </div>
      <PagedGrid key={gridKey(src) + media} fetchPage={fetchPage} />
      {lists && (
        <Picker title={t('tracker.my_lists')} onClose={() => setLists(false)} load={() => get('/tracker/lists')}
          onPick={(l: { id: string; name: string }) => pick({ kind: 'list', id: l.id, name: l.name })} />
      )}
    </div>
  );
}
