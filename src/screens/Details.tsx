import { useContext, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { FocusContext, getCurrentFocusKey, setFocus, useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { apiLang, t } from '../i18n';
import { errorText, get } from '../api/client';
import type { components } from '../api/schema';
import { onKey } from '../nav/keys';
import { useClaimFocus } from '../nav/focus';
import { LayerContext, stack } from '../nav/stack';
import { Backdrop } from '../ui/Backdrop';
import { imageList } from '../ui/backdrop-util';
import { Button } from '../ui/Button';
import { ErrorView } from '../ui/ErrorView';
import { ListItem } from '../ui/ListItem';
import { Row } from '../ui/Row';
import { Spinner } from '../ui/Spinner';
import { metaLine, orderSeasons, pickLogo, trailers } from './meta';
import { openSeason } from './Season';
import { openStreams } from './Streams';

type Item = { type: 'movie' | 'show'; tmdb_id: number; title: string };
type Data = components['schemas']['MovieDetails'] | components['schemas']['ShowDetails'];

export function openDetails(item: Item) {
  stack.push(() => <Details item={item} />);
}

function load(item: Item, lang: string) {
  const path = { tmdb_id: item.tmdb_id };
  const query = { lang };
  return item.type === 'movie'
    ? get('/movies/{tmdb_id}', { path, query })
    : get('/shows/{tmdb_id}', { path, query });
}

/** Fullscreen image viewer: Left/Right browse, Back closes. */
function Viewer({ urls, start, onClose }: { urls: string[]; start: number; onClose: () => void }) {
  const [i, setI] = useState(start);
  const layer = useContext(LayerContext);
  const { ref, focusKey, focusSelf } = useFocusable({
    isFocusBoundary: true,
    // false = norigin does not move focus; the viewer pages instead.
    onArrowPress: (dir: string) => {
      if (dir === 'left') setI((n) => Math.max(0, n - 1));
      if (dir === 'right') setI((n) => Math.min(urls.length - 1, n + 1));
      return false;
    },
  });
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const prev = getCurrentFocusKey();
    focusSelf();
    const off = onKey((a) => a === 'back' && (close.current(), true), { layer });
    return () => {
      off();
      void setFocus(prev);
    };
  }, []);
  return (
    <FocusContext.Provider value={focusKey}>
      <div ref={ref} class="viewer">
        <img src={urls[i]} alt="" />
        <span>{t('details.image_of', { i: i + 1, n: urls.length })}</span>
      </div>
    </FocusContext.Provider>
  );
}

function Details({ item }: { item: Item }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [reload, setReload] = useState(0);
  const lang = apiLang();
  useEffect(() => {
    setError(null);
    const req = load(item, lang);
    req.then(setData, (e) => e.code !== 'aborted' && setError(e));
    return req.abort;
  }, [lang, reload]);

  if (error) return <ErrorView message={errorText(error)} onRetry={() => setReload((n) => n + 1)} />;
  if (!data) return <Spinner />;
  return <Body item={item} data={data} lang={lang} />;
}

// Separate from Details so the focus claim runs once the content (not the spinner) is mounted.
function Body({ item, data, lang }: { item: Item; data: Data; lang: string }) {
  const [viewer, setViewer] = useState(-1);
  // The header scrolls the screen back to the top when it takes focus.
  const head = useFocusable({ trackChildren: true });
  useClaimFocus(head.focusKey, head.focusSelf);
  useEffect(() => {
    if (head.hasFocusedChild) (head.ref.current as HTMLElement).scrollIntoView(true);
  }, [head.hasFocusedChild]);

  const logo = pickLogo(data.images.logos, lang);
  const seasons = useMemo(() => ('seasons' in data ? orderSeasons(data.seasons) : []), [data]);
  const seasonItems = useMemo(
    () => seasons.map((s) => ({
      title: s.season_number ? s.name : t('details.specials'),
      poster: s.poster,
      caption: t('details.episodes_count', { n: s.episode_count }),
    })),
    [data, lang],
  );
  const castItems = useMemo(() => data.cast.map((c) => ({ title: c.name, poster: c.profile, caption: c.character })), [data, lang]);
  const backdrops = useMemo(() => data.images.backdrops.map((b) => b.url), [data]);
  const galleryItems = useMemo(
    () => backdrops.map((b, i) => ({ title: `${i + 1} / ${backdrops.length}`, poster: b.replace('/w1280/', '/w780/') })),
    [backdrops],
  );
  const videos = trailers(data.videos);
  return (
    <>
    <Backdrop images={imageList([data.backdrop])} />
    <div class="screen details">
      <FocusContext.Provider value={head.focusKey}>
        <div ref={head.ref} class="details-head">
          {logo ? <img class="details-logo" src={logo} alt={data.title} /> : <h1>{data.title}</h1>}
          <p class="details-meta">{metaLine(data)}</p>
          {data.tagline && <p class="details-tagline">{data.tagline}</p>}
          <p class="details-overview">{data.overview}</p>
          {item.type === 'movie' && (
            <Button
              label={t('details.find_streams')}
              onPress={() => openStreams({ type: 'movie', tmdb_id: item.tmdb_id, title: data.title, year: data.year, overview: data.overview, poster: data.poster || undefined, backdrops: imageList([data.backdrop].concat(backdrops)) })}
            />
          )}
        </div>
      {seasons.length > 0 && (
        <Row
          claim={false}
          title={t('details.seasons')}
          items={seasonItems}
          onSelect={(_, i) => openSeason({ tmdb_id: item.tmdb_id, title: data.title, year: data.year, poster: data.poster, backdrops: imageList([data.backdrop].concat(backdrops), 5) }, seasons[i].season_number)}
        />
      )}
      </FocusContext.Provider>
      {data.cast.length > 0 && (
        <Row
          claim={false}
          title={t('details.cast')}
          items={castItems}
          onSelect={() => {}}
        />
      )}
      {backdrops.length > 0 && (
        <Row
          claim={false}
          wide
          title={t('details.gallery')}
          items={galleryItems}
          onSelect={(_, i) => setViewer(i)}
        />
      )}
      {videos.length > 0 && <h2 class="details-h2">{t('details.trailers')}</h2>}
      {videos.map((v) => (
        <ListItem key={v.key}>{v.name + ' · ' + v.type}</ListItem>
      ))}
      <div class="screen-end" />
      {viewer >= 0 && <Viewer urls={backdrops} start={viewer} onClose={() => setViewer(-1)} />}
    </div>
    </>
  );
}
