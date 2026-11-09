import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ApiError } from '../src/api/client';
import { buildAnswer, createDispatcher, createPoller, startUi, stopUi, type Batch, type UIEvent } from '../src/uiClient';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};
const ev = (o: Partial<UIEvent> & { kind: UIEvent['kind'] }): UIEvent => ({ id: 'a', seq: 1, title: 't', message: 'm', ...o });
const batch = (seq: number, events: UIEvent[] = [], epoch = 'e1'): Batch => ({ seq, epoch, events });

// ---- poll loop ----
type R = Batch | undefined | Error | 'hang' | { epoch: string };
function poller(results: R[]) {
  const calls: Array<{ since?: number; epoch?: string }> = [];
  const aborted: number[] = [];
  const got: Batch[] = [];
  let resets = 0;
  const p = createPoller({
    poll: (q) => {
      calls.push({ ...q });
      const r = results.length ? results.shift()! : 'hang';
      const ok = (x: { epoch: string; batch?: Batch }) => Promise.resolve(x);
      const pr: any =
        r === 'hang' ? new Promise(() => {}) : r instanceof Error ? Promise.reject(r)
        : r === undefined ? ok({ epoch: '' }) : 'events' in r ? ok({ epoch: r.epoch, batch: r as Batch }) : ok(r as { epoch: string });
      pr.abort = () => aborted.push(calls.length);
      return pr;
    },
    onReset: () => resets++,
    onBatch: (b) => got.push(b),
  });
  return { p, calls, aborted, got, resets: () => resets };
}

test('poll sends since and epoch from the last batch; 204 keeps them', async () => {
  const { p, calls } = poller([batch(3), undefined, batch(5)]);
  p.start();
  await flush();
  expect(calls).toEqual([{ since: undefined, epoch: undefined }, { since: 3, epoch: 'e1' }, { since: 3, epoch: 'e1' }, { since: 5, epoch: 'e1' }]);
});

test('an epoch change is reported with the batch', async () => {
  const { p, got, resets } = poller([batch(3), batch(1, [], 'e2')]);
  p.start();
  await flush();
  expect(got.length).toBe(2);
  expect(resets()).toBe(1);
});

test('an epoch change seen only in a 204 header resets too', async () => {
  const { p, resets, calls } = poller([batch(3), { epoch: 'e2' }, { epoch: 'e2' }]);
  p.start();
  await flush();
  expect(resets()).toBe(1);
  expect(calls[calls.length - 1].epoch).toBe('e2');
});

test('no polling until started: resuming from hidden before start or after stop does nothing', async () => {
  const { p, calls } = poller([]);
  p.setPaused(true);
  p.setPaused(false);
  await flush();
  expect(calls.length).toBe(0);
  p.start();
  await flush();
  expect(calls.length).toBe(1);
  p.stop();
  p.setPaused(true);
  p.setPaused(false);
  await flush();
  expect(calls.length).toBe(1);
});

test('network errors back off 2, 5, 10, 30, 30 s and recover', async () => {
  const n = new ApiError('network', 0);
  const { p, calls } = poller([n, n, n, n, batch(1)]);
  p.start();
  await flush();
  expect(calls.length).toBe(1);
  for (const [ms, count] of [[2000, 2], [5000, 3], [10000, 4]]) {
    await vi.advanceTimersByTimeAsync(ms - 1);
    expect(calls.length).toBe(count - 1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls.length).toBe(count);
  }
  await vi.advanceTimersByTimeAsync(10000); // capped at 10 s; call 5 succeeds and the next poll follows at once
  expect(calls.length).toBe(6);
});

test('hidden aborts and pauses; shown resumes with the same since', async () => {
  const { p, calls, aborted } = poller([batch(4)]);
  p.start();
  await flush();
  expect(calls.length).toBe(2);
  p.setPaused(true);
  expect(aborted).toEqual([2]);
  await vi.advanceTimersByTimeAsync(60000);
  expect(calls.length).toBe(2);
  p.setPaused(false);
  await flush();
  expect(calls[2]).toEqual({ since: 4, epoch: 'e1' });
});

test('start twice runs one loop; stop ends it; a new start forgets since', async () => {
  const { p, calls } = poller([batch(4)]);
  p.start();
  p.start();
  await flush();
  expect(calls.length).toBe(2); // the first start's loop is gone, the second polled once and got batch 4, then hangs
  p.stop();
  p.start();
  await flush();
  expect(calls[calls.length - 1]).toEqual({ since: undefined, epoch: undefined });
});

test('401 stops the loop', async () => {
  const { p, calls } = poller([new ApiError('unauthorized', 401)]);
  p.start();
  await vi.advanceTimersByTimeAsync(60000);
  expect(calls.length).toBe(1);
  expect(p.running).toBe(false);
});

// ---- dispatcher ----
function disp(send = vi.fn(() => Promise.resolve())) {
  const toasts: string[] = [];
  let t = 1000;
  const d = createDispatcher({ toast: (m) => toasts.push(m), send, now: () => t, clientId: () => 'cid' });
  return { d, toasts, send, advance: (ms: number) => (t += ms) };
}

test('toasts are queued, one per 3.6 s', () => {
  const { d, toasts } = disp();
  d.handle([ev({ kind: 'notify', id: '1', title: '', message: 'one' }), ev({ kind: 'notify', id: '2', title: 'T', message: 'two' })]);
  expect(toasts).toEqual(['one']);
  vi.advanceTimersByTime(3600);
  expect(toasts).toEqual(['one', 'T: two']);
});

test('dialogs are FIFO, one at a time; a re-sent question is not duplicated', async () => {
  const { d } = disp();
  d.handle([ev({ kind: 'confirm', id: 'a' }), ev({ kind: 'input', id: 'b' }), ev({ kind: 'confirm', id: 'a' })]);
  expect(d.view().current!.ev.id).toBe('a');
  await d.answer(d.view().current!.ev, true);
  expect(d.view().current!.ev.id).toBe('b');
  d.handle([ev({ kind: 'confirm', id: 'a' })]); // answered already
  await d.answer(d.view().current!.ev);
  expect(d.view().current).toBeNull();
});

test('cancelled closes the open dialog, drops a queued one and removes progress', () => {
  const { d } = disp();
  d.handle([ev({ kind: 'confirm', id: 'a' }), ev({ kind: 'select', id: 'b' }), ev({ kind: 'progress', id: 'p', progress: { id: 'p', percent: 1, heading: 'h', line: 'l', done: false } })]);
  d.handle([ev({ kind: 'cancelled', id: 'b' })]);
  d.handle([ev({ kind: 'cancelled', id: 'a' }), ev({ kind: 'cancelled', id: 'p' })]);
  expect(d.view().current).toBeNull();
  expect(d.view().progress).toEqual([]);
});

test('during playback dialogs wait, toasts and progress still show; the dialog appears after', () => {
  const { d, toasts } = disp();
  d.setPlayback(true);
  d.handle([ev({ kind: 'confirm', id: 'a' }), ev({ kind: 'notify', id: 'n', message: 'hi', title: '' })]);
  expect(d.view().current).toBeNull();
  expect(toasts).toEqual(['hi']);
  d.setPlayback(false);
  expect(d.view().current!.ev.id).toBe('a');
});

test('a question that timed out while queued is skipped', () => {
  const { d, advance } = disp();
  d.setPlayback(true);
  d.handle([ev({ kind: 'confirm', id: 'a', timeout_s: 5 }), ev({ kind: 'confirm', id: 'b' })]);
  advance(6000);
  d.setPlayback(false);
  expect(d.view().current!.ev.id).toBe('b');
});

test('progress updates coalesce by id and done closes', () => {
  const { d } = disp();
  const pe = (pct: number, done = false) => ev({ kind: 'progress', id: 'p', progress: { id: 'p', percent: pct, heading: 'h', line: 'l', done } });
  d.handle([pe(10), pe(40)]);
  expect(d.view().progress.map((p) => p.percent)).toEqual([40]);
  d.handle([pe(100, true)]);
  expect(d.view().progress).toEqual([]);
});

test('reset clears dialogs and progress', () => {
  const { d } = disp();
  d.handle([ev({ kind: 'confirm', id: 'a' })]);
  d.reset();
  expect(d.view().current).toBeNull();
});

test('answer: 400 and network errors keep the dialog with a generic text, 410 closes it', async () => {
  const send = vi.fn().mockRejectedValueOnce(new ApiError('api', 400, 'bad_request', 'index out of range')).mockRejectedValueOnce(new ApiError('network', 0)).mockRejectedValueOnce(new ApiError('api', 410, 'ui_request_expired'));
  const { d } = disp(send);
  d.handle([ev({ kind: 'select', id: 'a', options: ['x'] })]);
  await d.answer(d.view().current!.ev, [5]);
  expect(d.view().current!.ev.id).toBe('a');
  expect(d.view().error).toBe('The answer was not accepted');
  await d.answer(d.view().current!.ev, [0]);
  expect(d.view().current!.ev.id).toBe('a');
  expect(d.view().error).toBe("Can't reach Elementum.");
  await d.answer(d.view().current!.ev, [0]);
  expect(d.view().current).toBeNull();
  expect(d.view().error).toBe('');
});

test('answer payloads per kind', () => {
  expect(buildAnswer({ kind: 'confirm' }, 'c', true)).toEqual({ client_id: 'c', yes: true });
  expect(buildAnswer({ kind: 'confirm' }, 'c', false)).toEqual({ client_id: 'c', yes: false });
  expect(buildAnswer({ kind: 'select' }, 'c', [0, 2])).toEqual({ client_id: 'c', selected: [0, 2] });
  expect(buildAnswer({ kind: 'input' }, 'c', 'abc')).toEqual({ client_id: 'c', text: 'abc' });
  expect(buildAnswer({ kind: 'text' }, 'c', true)).toEqual({ client_id: 'c', yes: true });
  expect(buildAnswer({ kind: 'confirm' }, 'c')).toEqual({ client_id: 'c', cancel: true });
});

test('a UI dialog waits while an app dialog or menu is open, and returns after', () => {
  const { d } = disp();
  d.handle([ev({ kind: 'confirm', id: 'a' })]);
  expect(d.view().current!.ev.id).toBe('a');
  d.modal(1); // an app Dialog mounted over it
  expect(d.view().current).toBeNull();
  d.modal(1);
  d.modal(-1);
  expect(d.view().current).toBeNull();
  d.modal(-1);
  expect(d.view().current!.ev.id).toBe('a');
});

test('a progress the user cancelled is not re-added; its done clears the memory', () => {
  const { d } = disp();
  const pe = (pct: number, done = false) => ev({ kind: 'progress', id: 'p', progress: { id: 'p', percent: pct, heading: 'h', line: 'l', done } });
  d.handle([pe(10)]);
  void d.cancelProgress('p');
  d.handle([pe(50)]);
  expect(d.view().progress).toEqual([]);
  d.handle([pe(100, true), pe(5)]);
  expect(d.view().progress.length).toBe(1);
});

test('wiring: the real poll aborts its XHR on stop/start, and only one is open at a time', async () => {
  const all: Array<{ aborted: boolean; done: boolean; url: string }> = [];
  class X {
    aborted = false;
    done = false;
    url = '';
    timeout = 0;
    onabort?: () => void;
    constructor() { all.push(this); }
    open(_m: string, url: string) { this.url = url; }
    setRequestHeader() {}
    send() {}
    abort() { this.aborted = true; if (this.onabort) this.onabort(); }
  }
  vi.stubGlobal('XMLHttpRequest', X);
  const open = () => all.filter((x) => !x.aborted && !x.done).length;
  startUi();
  await flush();
  expect(all.length).toBe(1);
  expect(all[0].url).toContain('/ui/events');
  startUi(); // replaces the loop: the first request is aborted
  await flush();
  expect(all[0].aborted).toBe(true);
  expect(open()).toBe(1);
  stopUi();
  await flush();
  expect(open()).toBe(0);
  vi.unstubAllGlobals();
});
