// Pure helpers for the details and season screens.
import type { components } from '../api/schema';
import { t } from '../i18n';

type S = components['schemas'];

/** Logo in the app language (`de-DE` → `de`), else English, else the first one; SVG is skipped (slow to decode). */
export function pickLogo(logos: S['Image'][], lang: string): string | null {
  const l = lang.slice(0, 2);
  const png = logos.filter((x) => !/\.svg$/.test(x.url));
  const hit = png.find((x) => x.language === l) || png.find((x) => x.language === 'en') || png[0];
  return hit ? hit.url.replace('/original/', '/w500/') : null;
}

/** Specials (season 0) go last. */
export function orderSeasons(seasons: S['SeasonSummary'][]): S['SeasonSummary'][] {
  return seasons.filter((s) => s.season_number > 0).concat(seasons.filter((s) => s.season_number === 0));
}

/** 136 → "2 h 16 min"; empty when unknown. */
export function formatRuntime(min: number | null | undefined): string {
  if (!min) return '';
  return min < 60 ? t('details.minutes', { m: min }) : t('details.hours_minutes', { h: Math.floor(min / 60), m: min % 60 });
}

/** "1999 · 2 h 16 min · ★ 8.3 · Action, Science Fiction", skipping unknown parts. */
export function metaLine(d: S['MovieDetails'] | S['ShowDetails']): string {
  const runtime = 'runtime' in d ? d.runtime : d.episode_runtime;
  return [d.year, formatRuntime(runtime), d.rating > 0 && '★ ' + d.rating.toFixed(1), d.genres.join(', ')]
    .filter(Boolean)
    .join(' · ');
}

/** Trailers and teasers first, then other videos; at most 10. */
export function trailers(videos: S['Video'][]): S['Video'][] {
  const main = (v: S['Video']) => v.type === 'Trailer' || v.type === 'Teaser';
  return videos.filter(main).concat(videos.filter((v) => !main(v))).slice(0, 10);
}
