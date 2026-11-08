import { expect, test } from 'vitest';
import { revealTop } from '../src/ui/reveal';

test('revealTop moves only when the element is outside the view', () => {
  expect(revealTop(100, 500, 200, 60)).toBe(100); // inside
  expect(revealTop(100, 500, 40, 60)).toBe(40); // above: align top
  expect(revealTop(100, 500, 580, 60)).toBe(140); // below: align bottom
});
