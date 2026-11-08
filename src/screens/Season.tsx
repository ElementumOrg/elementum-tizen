import { useEffect, useState } from 'preact/hooks';
import { FocusContext, useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { apiLang, t } from '../i18n';
import { errorText, get } from '../api/client';
import type { components } from '../api/schema';
import { stack } from '../nav/stack';
import { useClaimFocus } from '../nav/focus';
import { ErrorView } from '../ui/ErrorView';
import { ListItem } from '../ui/ListItem';
import { Spinner } from '../ui/Spinner';
import { formatRuntime } from './meta';
import { openStreams } from './Streams';

type Season = components['schemas']['Season'];

export function openSeason(show: { tmdb_id: number; title: string }, season: number) {
  stack.push(() => <SeasonScreen show={show} season={season} />);
}

function SeasonScreen({ show, season }: { show: { tmdb_id: number; title: string }; season: number }) {
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

  if (error) return <ErrorView message={errorText(error)} onRetry={() => setReload((n) => n + 1)} />;
  if (!data) return <Spinner />;
  return <Episodes show={show} data={data} />;
}

// Separate so the focus claim runs once the list (not the spinner) is mounted.
function Episodes({ show, data }: { show: { tmdb_id: number; title: string }; data: Season }) {
  const [cur, setCur] = useState(0); // stills only load near the focus
  const { ref, focusKey, focusSelf } = useFocusable();
  useClaimFocus(focusKey, focusSelf);
  return (
    <FocusContext.Provider value={focusKey}>
      <div ref={ref} class="screen season">
        <h1>{show.title + ' · ' + data.name}</h1>
        {!data.episodes.length && <p style="margin-left:24px">{t('details.no_episodes')}</p>}
        {data.episodes.map((e, i) => (
          <ListItem
            key={e.episode_number}
            cls="episode"
            onFocus={() => setCur(i)}
            onPress={() =>
              openStreams({
                type: 'episode',
                tmdb_id: show.tmdb_id,
                season: e.season_number,
                episode: e.episode_number,
                title: `${show.title} · S${e.season_number}E${e.episode_number}`,
              })
            }
          >
            <div class="still">{e.still && Math.abs(i - cur) <= 5 && <img src={e.still} alt="" />}</div>
            <div class="info">
              <h3>{`S${e.season_number}E${e.episode_number} · ${e.name}`}</h3>
              <small>{[e.air_date, formatRuntime(e.runtime)].filter(Boolean).join(' · ')}</small>
              <p>{e.overview}</p>
            </div>
          </ListItem>
        ))}
        <div class="screen-end" />
      </div>
    </FocusContext.Provider>
  );
}
