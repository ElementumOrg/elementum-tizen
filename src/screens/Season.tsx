import { useEffect, useRef, useState } from 'preact/hooks';
import { FocusContext, setFocus, useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { apiLang, t } from '../i18n';
import { errorText, get } from '../api/client';
import type { components } from '../api/schema';
import { stack } from '../nav/stack';
import { useClaimFocus } from '../nav/focus';
import { Backdrop } from '../ui/Backdrop';
import { big, imageList } from '../ui/backdrop-util';
import { ErrorView } from '../ui/ErrorView';
import { Badges } from '../ui/Badges';
import { openItemMenu } from '../ui/ItemMenu';
import { firstUnwatched, resumeFraction, useItemState, useRefreshAfterChanges, type Ref } from '../ui/item-state';
import { ListItem } from '../ui/ListItem';
import { Spinner } from '../ui/Spinner';
import { formatRuntime } from './meta';
import { openStreams } from './Streams';

type Season = components['schemas']['Season'];
type Episode = components['schemas']['Episode'];
/** `backdrops`/`poster`/`year` are optional context for the backgrounds and the buffering dialog. */
type Show = { tmdb_id: number; title: string; year?: number | null; poster?: string | null; backdrops?: string[] };

export function openSeason(show: Show, season: number) {
  stack.push(() => <SeasonScreen show={show} season={season} />);
}

function SeasonScreen({ show, season }: { show: Show; season: number }) {
  const [data, setData] = useState<Season | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [reload, setReload] = useState(0);
  const lang = apiLang();

  useEffect(() => {
    setError(null);
    const req = get('/shows/{tmdb_id}/seasons/{season}', { path: { tmdb_id: show.tmdb_id, season }, query: { lang } });
    req.then(setData, (e) => e.code !== 'aborted' && setError(e));
    return req.abort;
  }, [lang, reload]);
  useRefreshAfterChanges(() => setReload((n) => n + 1));

  if (error) return <ErrorView message={errorText(error)} onRetry={() => setReload((n) => n + 1)} />;
  if (!data) return <Spinner />;
  return <Episodes show={show} data={data} />;
}

// Separate so the focus claim runs once the list (not the spinner) is mounted.
function Episodes({ show, data }: { show: Show; data: Season }) {
  const [cur, setCur] = useState(0); // stills only load near the focus
  const { ref, focusKey, focusSelf } = useFocusable();
  // Land on the first unwatched episode (ListItem's focus handler scrolls it into view).
  const start = useRef(firstUnwatched(data.episodes, 0)).current;
  useClaimFocus(focusKey, () => (start > 0 ? void setFocus(`${focusKey}-ep${start}`) : focusSelf()));
  const shows = show.backdrops || [];
  return (
    <FocusContext.Provider value={focusKey}>
      <Backdrop images={imageList(shows.length ? shows : [big(data.poster)])} />
      <div ref={ref} class="screen season">
        <h1>{show.title + ' · ' + data.name}</h1>
        {!data.episodes.length && <p style="margin-left:24px">{t('details.no_episodes')}</p>}
        {data.episodes.map((e, i) => (
          <EpisodeRow key={e.episode_number} e={e} i={i} cur={cur} setCur={setCur} focusKey={`${focusKey}-ep${i}`} show={show} data={data} />
        ))}
      </div>
    </FocusContext.Provider>
  );
}

function EpisodeRow({ e, i, cur, setCur, focusKey, show, data }: { e: Episode; i: number; cur: number; setCur: (i: number) => void; focusKey: string; show: Show; data: Season }) {
  const shows = show.backdrops || [];
  const ref: Ref = { kind: 'episode', tmdb_id: show.tmdb_id, season: e.season_number, episode: e.episode_number };
  const st = useItemState(ref, e);
  const bar = resumeFraction(e.resume_s, e.runtime);
  return (
    <ListItem
      focusKey={focusKey}
      cls={st.watched === true ? 'episode watched' : 'episode'}
      onFocus={() => setCur(i)}
      onMenu={() => openItemMenu(ref, st)}
      onPress={() =>
        openStreams({
          type: 'episode',
          tmdb_id: show.tmdb_id,
          season: e.season_number,
          episode: e.episode_number,
          title: show.title,
          subtitle: `S${e.season_number}E${e.episode_number} · ${e.name}`,
          poster: data.poster || show.poster || e.still || undefined,
          year: show.year,
          overview: e.overview,
          backdrops: imageList([big(e.still)].concat(shows.slice(0, 3), data.episodes.filter((x) => x !== e).map((x) => big(x.still)).slice(0, 3))),
        })
      }
    >
      <div class="still">
        {e.still && Math.abs(i - cur) <= 5 && <img src={e.still} alt="" />}
        <Badges state={{ watched: st.watched, progress: st.watched === true ? null : bar }} />
      </div>
      <div class="info">
        <h3>{`S${e.season_number}E${e.episode_number} · ${e.name}`}</h3>
        <small>{[e.air_date, formatRuntime(e.runtime)].filter(Boolean).join(' · ')}</small>
        <p>{e.overview}</p>
      </div>
    </ListItem>
  );
}
