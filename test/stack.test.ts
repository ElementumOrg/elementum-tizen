import { expect, test } from 'vitest';
import { createStack, MAX_DEPTH } from '../src/nav/stack';
import { dispatch, keyAction, onKey } from '../src/nav/keys';

function setup() {
  let current = 'a';
  const restored: string[] = [];
  const s = createStack({ get: () => current, set: (k) => restored.push(k || '-') });
  return { s, restored, focus: (k: string) => (current = k) };
}

test('push saves focus, pop restores it, root cannot be popped', () => {
  const { s, restored, focus } = setup();
  let renders = 0;
  s.subscribe(() => renders++);
  s.push(() => 'root');
  focus('home-row-3');
  s.push(() => 'details');
  focus('details-play');
  s.push(() => 'streams');
  expect(s.entries.map((e) => e.view())).toEqual(['root', 'details', 'streams']);

  expect(s.pop()).toBe(true);
  expect(restored).toEqual(['details-play']);
  expect(s.pop()).toBe(true);
  expect(restored).toEqual(['details-play', 'home-row-3']);
  expect(s.pop()).toBe(false);
  expect(s.entries.map((e) => e.view())).toEqual(['root']);
  expect(renders).toBe(5);
});

test('replace swaps the top and pop goes below it', () => {
  const { s, restored, focus } = setup();
  s.push(() => 'root');
  focus('poster-1');
  s.push(() => 'buffering');
  const id = s.entries[1].id;
  s.replace(() => 'player');
  expect(s.entries.map((e) => e.view())).toEqual(['root', 'player']);
  expect(s.entries[1].id).not.toBe(id); // new id remounts the screen
  expect(s.pop()).toBe(true);
  expect(restored).toEqual(['poster-1']);
});

test('keyAction maps TV and browser keys, Backspace in inputs is left alone', () => {
  const div = { tagName: 'DIV' } as unknown as EventTarget;
  const input = { tagName: 'INPUT' } as unknown as EventTarget;
  expect(keyAction({ keyCode: 10009, target: div })).toBe('back');
  expect(keyAction({ keyCode: 8, target: div })).toBe('back');
  expect(keyAction({ keyCode: 27, target: div })).toBe('back');
  expect(keyAction({ keyCode: 8, target: input })).toBeUndefined();
  expect(keyAction({ keyCode: 10252, target: div })).toBe('playpause');
  expect(keyAction({ keyCode: 65, target: div })).toBeUndefined();
});

test('push beyond MAX_DEPTH drops the oldest non-root entry', () => {
  const { s } = setup();
  for (let i = 0; i < MAX_DEPTH + 2; i++) s.push(() => `s${i}`);
  expect(s.entries.map((e) => e.view())).toEqual(['s0', 's3', 's4', 's5', 's6', 's7']);
  expect(s.entries.length).toBe(MAX_DEPTH);
});

test('layer key handlers run only while their layer is on top; global ones always', () => {
  const { s } = setup();
  s.push(() => 'root');
  s.push(() => 'details');
  const [root, details] = s.entries.map((e) => e.id);
  const calls: string[] = [];
  const offs = [
    onKey(() => void calls.push('global'), { global: true }),
    onKey(() => (calls.push('root'), true), { layer: root }), // hidden lower layer: must not swallow Back
    onKey(() => void calls.push('details'), { layer: details }),
  ];
  const e = {} as KeyboardEvent;
  expect(dispatch('back', e, s.isTop)).toBe(false);
  expect(calls).toEqual(['details', 'global']);

  calls.length = 0;
  s.replace(() => 'other'); // details layer gone, root still hidden
  dispatch('back', e, s.isTop);
  expect(calls).toEqual(['global']);
  expect(s.isTop(0)).toBe(true);
  offs.forEach((off) => off());
});
