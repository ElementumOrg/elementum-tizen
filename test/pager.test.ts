import { expect, test } from 'vitest';
import { createPager, type Page, type PagerState } from '../src/ui/pager';

/** A fetcher whose pages the test resolves by hand. */
function setup(pages: Array<Page<number> | Error>) {
  const calls: number[] = [];
  const waiting: Array<() => void> = [];
  const fetchPage = (n: number) => {
    const reply = pages[calls.push(n) - 1]; // by call order, so a retry can answer differently
    return new Promise<Page<number>>((resolve, reject) => {
      waiting.push(() => (reply instanceof Error ? reject(reply) : resolve(reply)));
    });
  };
  let state!: PagerState<number>;
  const pager = createPager(fetchPage, (s) => (state = s));
  const settle = async () => {
    waiting.shift()!();
    await new Promise((r) => setTimeout(r, 0));
  };
  return { pager, calls, settle, state: () => state };
}

test('no duplicate fetch while loading; stops at total_pages', async () => {
  const s = setup([{ items: [1], total_pages: 2 }, { items: [2], total_pages: 2 }]);
  s.pager.more();
  s.pager.more();
  expect(s.calls).toEqual([1]);
  await s.settle();
  s.pager.more();
  await s.settle();
  expect(s.state().items).toEqual([1, 2]);
  expect(s.state().done).toBe(true);
  s.pager.more();
  expect(s.calls).toEqual([1, 2]);
});

test('an empty page keeps fetching until items arrive', async () => {
  const s = setup([{ items: [], total_pages: 3 }, { items: [], total_pages: 3 }, { items: [7], total_pages: 3 }]);
  s.pager.more();
  await s.settle();
  await s.settle();
  await s.settle();
  expect(s.calls).toEqual([1, 2, 3]);
  expect(s.state().items).toEqual([7]);
  expect(s.state().done).toBe(true);
});

test('an error stops paging; more() retries the same page', async () => {
  const s = setup([new Error('x'), { items: [1], total_pages: 1 }]);
  s.pager.more();
  await s.settle();
  expect(s.state().error).toBeInstanceOf(Error);
  s.pager.more();
  await s.settle();
  expect(s.calls).toEqual([1, 1]);
  expect(s.state().error).toBe(null);
  expect(s.state().items).toEqual([1]);
});

test('dispose drops a late page and aborts the request', async () => {
  let abort = 0;
  let resolve!: (p: Page<number>) => void;
  let state: PagerState<number> | undefined;
  const pager = createPager(
    () => Object.assign(new Promise<Page<number>>((r) => (resolve = r)), { abort: () => abort++ }),
    (s) => (state = s),
  );
  pager.more();
  pager.dispose();
  resolve({ items: [1], total_pages: 1 });
  await new Promise((r) => setTimeout(r, 0));
  expect(abort).toBe(1);
  expect(state!.items).toEqual([]);
});

test('total_pages 0 is done with no items and no extra fetch', async () => {
  const s = setup([{ items: [], total_pages: 0 }]);
  s.pager.more();
  await s.settle();
  expect(s.state().done).toBe(true);
  expect(s.calls).toEqual([1]);
});
