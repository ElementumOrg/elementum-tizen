import { expect, test } from 'vitest';
import { formatRuntime, metaLine, orderSeasons, pickLogo, trailers } from '../src/screens/meta';

const logo = (language: string | null, url: string) => ({ language, url, width: 1, height: 1 });

test('pickLogo: app language, else English, else first; skips svg; shrinks original', () => {
  const logos = [logo('fr', 'x/original/fr.png'), logo('en', 'x/original/en.png'), logo('de', 'x/original/de.svg'), logo('de', 'x/original/de.png')];
  expect(pickLogo(logos, 'de-DE')).toBe('x/w500/de.png');
  expect(pickLogo(logos, 'it-IT')).toBe('x/w500/en.png');
  expect(pickLogo([logo('fr', 'a.png')], 'de')).toBe('a.png');
  expect(pickLogo([logo('en', 'a.svg')], 'en')).toBeNull();
  expect(pickLogo([], 'en')).toBeNull();
});

test('orderSeasons puts specials last', () => {
  const s = [0, 2, 1].map((n) => ({ season_number: n }) as any);
  expect(orderSeasons(s).map((x) => x.season_number)).toEqual([2, 1, 0]);
});

test('formatRuntime', () => {
  expect(formatRuntime(null)).toBe('');
  expect(formatRuntime(45)).toBe('45 min');
  expect(formatRuntime(136)).toBe('2 h 16 min');
});

test('trailers: trailers and teasers first, capped', () => {
  const v = (type: string) => ({ type }) as any;
  expect(trailers([v('Clip'), v('Trailer'), v('Teaser')]).map((x) => x.type)).toEqual(['Trailer', 'Teaser', 'Clip']);
  expect(trailers(Array.from({ length: 20 }, () => v('Clip')))).toHaveLength(10);
});

test('metaLine skips unknown parts and uses episode runtime for shows', () => {
  const m = { year: 1999, runtime: 136, rating: 8.26, genres: ['Action', 'Sci-Fi'] } as any;
  expect(metaLine(m)).toBe('1999 · 2 h 16 min · ★ 8.3 · Action, Sci-Fi');
  expect(metaLine({ year: null, episode_runtime: 45, rating: 0, genres: [] } as any)).toBe('45 min');
});
