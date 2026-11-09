import { useEffect, useState } from 'preact/hooks';
import { FocusContext, useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { apiLang, t } from '../i18n';
import { errorText, get } from '../api/client';
import type { components } from '../api/schema';
import { useClaimFocus } from '../nav/focus';
import { stack } from '../nav/stack';
import { Backdrop } from '../ui/Backdrop';
import { imageList } from '../ui/backdrop-util';
import { ErrorView } from '../ui/ErrorView';
import { Row } from '../ui/Row';
import { Spinner } from '../ui/Spinner';
import { scrollTopTo } from '../ui/tween';
import { openDetails } from './Details';

type Person = components['schemas']['Person'];
type Credits = components['schemas']['PersonCredits'];

const DEPARTMENTS: Record<string, string> = {
  Acting: 'acting', Directing: 'directing', Writing: 'writing', Production: 'production', Sound: 'sound', Camera: 'camera',
  Editing: 'editing', Art: 'art', Crew: 'crew', 'Costume & Make-Up': 'costume', 'Visual Effects': 'vfx', Lighting: 'lighting',
};
export const department = (d: string) => (DEPARTMENTS[d] ? t('person.dept.' + DEPARTMENTS[d]) : d);

/** "1964-09-02" in the UI language ("2 September 1964"); the raw text when it isn't a date. */
export function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(iso);
  if (!m) return iso;
  try {
    return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString(apiLang(), { year: 'numeric', month: 'long', day: 'numeric' });
  } catch (_) {
    return iso;
  }
}

export function openPerson(p: { tmdb_id: number; name: string }) {
  stack.push(() => <PersonScreen id={p.tmdb_id} />);
}

function PersonScreen({ id }: { id: number }) {
  const [data, setData] = useState<{ person: Person; credits: Credits } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [reload, setReload] = useState(0);
  const lang = apiLang();
  useEffect(() => {
    setError(null);
    const path = { tmdb_id: id };
    const query = { lang };
    const a = get('/people/{tmdb_id}', { path, query });
    const b = get('/people/{tmdb_id}/credits', { path, query });
    Promise.all([a, b]).then(([person, credits]) => setData({ person, credits }), (e) => e.code !== 'aborted' && setError(e));
    return () => (a.abort(), b.abort());
  }, [lang, reload]);

  if (error) return <ErrorView message={errorText(error)} onRetry={() => setReload((n) => n + 1)} />;
  if (!data) return <Spinner />;
  return <Body person={data.person} credits={data.credits} />;
}

// Separate so the focus claim runs once the content (not the spinner) is mounted.
function Body({ person, credits }: { person: Person; credits: Credits }) {
  // The header is focusable (scrolls the screen back to the top), like Details; the rows are below it.
  const head = useFocusable({ onFocus: () => scrollTopTo(head.ref.current as HTMLElement) });
  useClaimFocus(head.focusKey, head.focusSelf);
  const bg = credits.movies.concat(credits.shows).filter((m) => m.backdrop)[0];
  const dates = [
    person.birthday && t('person.born', { date: formatDate(person.birthday) }),
    person.deathday && t('person.died', { date: formatDate(person.deathday) }),
    person.place_of_birth,
  ].filter(Boolean).join(' · ');
  return (
    <>
      <Backdrop images={imageList([bg && bg.backdrop])} />
      <div class="screen person">
        <FocusContext.Provider value={head.focusKey}>
          <div ref={head.ref} class="person-head">
            {person.profile && <img class="person-photo" src={person.profile} alt="" />}
            <div class="person-info">
              <h1>{person.name}</h1>
              {person.known_for_department && <p class="details-meta">{department(person.known_for_department)}</p>}
              {dates && <p class="details-meta">{dates}</p>}
              {person.biography && <p class="person-bio">{person.biography}</p>}
            </div>
          </div>
        </FocusContext.Provider>
        {credits.movies.length > 0 && <Row claim={false} title={t('nav.movies')} items={credits.movies} onSelect={openDetails} />}
        {credits.shows.length > 0 && <Row claim={false} title={t('nav.shows')} items={credits.shows} onSelect={openDetails} />}
        <div class="screen-end" />
      </div>
    </>
  );
}
