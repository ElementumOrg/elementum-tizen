import { expect, test } from 'vitest';
import { big, imageList, nextIndex } from '../src/ui/backdrop-util';

test('imageList drops empties and duplicates, and caps', () => {
  expect(imageList(['a', null, 'b', 'a', undefined, 'c'], 2)).toEqual(['a', 'b']);
  expect(imageList([])).toEqual([]);
});

test('big rewrites the TMDB size', () => {
  expect(big('https://image.tmdb.org/t/p/w300/x.jpg')).toBe('https://image.tmdb.org/t/p/w1280/x.jpg');
  expect(big(null)).toBeNull();
});

test('nextIndex wraps', () => {
  expect(nextIndex(0, 3)).toBe(1);
  expect(nextIndex(2, 3)).toBe(0);
  expect(nextIndex(0, 0)).toBe(0);
});
