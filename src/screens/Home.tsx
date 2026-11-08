import { get } from '../api/client';
import { apiLang, t } from '../i18n';
import { LIMIT, PagedRow } from '../ui/Paged';

const q = (page: number) => ({ page, limit: LIMIT, lang: apiLang() });

export function Home() {
  return (
    <div class="screen">
      <PagedRow title={t('home.next_up')} fetchPage={(page) => {
        const r = get('/tracker/shows/progress', { query: q(page) });
        // Rows show the shows; the episode is for the details screen.
        return Object.assign(r.then((x) => ({ items: x.items.map((i) => i.show), total_pages: x.total_pages })), { abort: r.abort });
      }} />
      <PagedRow title={t('home.trending_movies')} fetchPage={(page) => get('/movies/lists/{list}', { path: { list: 'trending' }, query: q(page) })} />
      <PagedRow title={t('home.trending_shows')} fetchPage={(page) => get('/shows/lists/{list}', { path: { list: 'trending' }, query: q(page) })} />
      <PagedRow title={t('home.watchlist_movies')} fetchPage={(page) => get('/tracker/{media}/watchlist', { path: { media: 'movies' }, query: q(page) })} />
      <PagedRow title={t('home.watchlist_shows')} fetchPage={(page) => get('/tracker/{media}/watchlist', { path: { media: 'shows' }, query: q(page) })} />
    </div>
  );
}
