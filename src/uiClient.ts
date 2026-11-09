// Elementum's UI host, client side: a long-poll loop for /ui/events, and a dispatcher that turns the events into
// toasts, a FIFO of dialogs (confirm/select/input/text) and progress cards. Presentation is in ui/UiHost.tsx.
import { ApiError, errorText, get, post } from './api/client';
import type { components } from './api/schema';
import { apiLang, t } from './i18n';
import { load, save } from './settings';

export type UIEvent = components['schemas']['UIEvent'];
export type Batch = components['schemas']['UIEventBatch'];
export type Progress = components['schemas']['UIProgress'];
export type Answer = components['schemas']['UIAnswer'];

export const WAIT_S = 25;
const BACKOFF_MS = [2000, 5000, 10000];
const TOAST_MS = 3600; // a little over the toast's own 3.5 s
const MAX_TOASTS = 20;

/** Stable per install; the server accepts [A-Za-z0-9_-]{1,64}. */
export function clientId(): string {
  let id = load('client_id');
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
    id = 'tv-';
    for (let i = 0; i < 12; i++) id += Math.floor(Math.random() * 36).toString(36);
    save('client_id', id);
  }
  return id;
}

/** The POST body for a user's reaction; `value` is yes (confirm), indexes (select), text (input); undefined = cancel. */
export function buildAnswer(ev: Pick<UIEvent, 'kind'>, id: string, value?: boolean | number[] | string): Answer {
  if (value === undefined) return { client_id: id, cancel: true };
  if (ev.kind === 'confirm') return { client_id: id, yes: value === true };
  if (ev.kind === 'select') return { client_id: id, selected: value as number[] };
  if (ev.kind === 'input') return { client_id: id, text: String(value) };
  return { client_id: id, yes: true }; // text: any answer closes it
}

// ---- dispatcher -----------------------------------------------------------------------------------------------

interface Item {
  ev: UIEvent;
  at: number;
}
export interface UiView {
  /** The dialog to show now (null during playback or when none is waiting). */
  current: Item | null;
  progress: Progress[];
  /** Why the last answer was refused (400); shown in the dialog. */
  error: string;
}

export interface DispatcherDeps {
  toast(msg: string): void;
  /** POSTs an answer; rejects with ApiError. */
  send(id: string, body: Answer): Promise<unknown>;
  now(): number;
  clientId(): string;
}

/** The server has no `urgent` flag, so while the player is open every dialog waits (toasts and progress still show). */
export function createDispatcher(d: DispatcherDeps) {
  let dialogs: Item[] = [];
  let progress: Progress[] = [];
  let toasts: string[] = [];
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  let playback = false;
  let modals = 0; // app dialogs and menus open; a UI dialog waits for them like for the player
  let cancelled: string[] = []; // progress ids the user cancelled: only their `done` is accepted
  let error = '';
  let finished: string[] = []; // answered ids, so a re-sent open question isn't shown twice
  const subs: Array<() => void> = [];
  const emit = () => subs.forEach((f) => f());

  const drain = () => {
    if (toastTimer || !toasts.length) return;
    d.toast(toasts.shift()!);
    toastTimer = setTimeout(() => ((toastTimer = undefined), drain()), TOAST_MS);
  };
  const expired = (i: Item) => !!i.ev.timeout_s && d.now() - i.at >= i.ev.timeout_s * 1000;
  const remove = (id: string) => {
    const was = dialogs[0];
    dialogs = dialogs.filter((i) => i.ev.id !== id);
    if (dialogs[0] !== was) error = '';
  };

  const api = {
    handle(events: UIEvent[]) {
      for (const ev of events) {
        if (ev.kind === 'notify') {
          const msg = ev.title && ev.message ? ev.title + ': ' + ev.message : ev.message || ev.title;
          if (msg && toasts.length < MAX_TOASTS) toasts.push(msg);
        } else if (ev.kind === 'progress' && ev.progress) {
          const p = ev.progress;
          const i = progress.findIndex((x) => x.id === p.id);
          if (cancelled.indexOf(p.id) >= 0) {
            if (p.done) cancelled = cancelled.filter((x) => x !== p.id);
          } else if (p.done) progress = progress.filter((x) => x.id !== p.id);
          else if (i < 0) progress = progress.concat(p);
          else progress = progress.map((x, j) => (j === i ? p : x));
        } else if (ev.kind === 'cancelled') {
          remove(ev.id);
          progress = progress.filter((x) => x.id !== ev.id);
        } else if (!dialogs.some((i) => i.ev.id === ev.id) && finished.indexOf(ev.id) < 0) {
          dialogs.push({ ev, at: d.now() });
        }
      }
      drain();
      emit();
    },
    /** Epoch change: Elementum restarted, so nothing open on it exists any more. */
    reset() {
      dialogs = [];
      progress = [];
      error = '';
      finished = [];
      cancelled = [];
      emit();
    },
    setPlayback(on: boolean) {
      playback = on;
      emit();
    },
    /** An app Dialog or menu opened (+1) or closed (-1). */
    modal(delta: number) {
      modals = Math.max(0, modals + delta);
      emit();
    },
    modals: () => modals,
    /** Timed out locally: close without answering (the server applies its default). */
    expire(id: string) {
      remove(id);
      emit();
    },
    /** A reaction to the shown dialog (undefined = cancel). 400 keeps it open with the message; 404/410/others close it. */
    async answer(ev: UIEvent, value?: boolean | number[] | string) {
      try {
        await d.send(ev.id, buildAnswer(ev, d.clientId(), value));
      } catch (e) {
        // Only a closed request (404/410) is final; anything else keeps the dialog so the user can retry.
        if (!(e instanceof ApiError && (e.status === 404 || e.status === 410))) {
          error = e instanceof ApiError && e.status !== 400 ? errorText(e) : t('ui.invalid');
          return emit();
        }
      }
      finished = finished.concat(ev.id).slice(-100);
      remove(ev.id);
      emit();
    },
    cancelProgress(id: string) {
      cancelled = cancelled.concat(id).slice(-20);
      progress = progress.filter((x) => x.id !== id);
      emit();
      return d.send(id, buildAnswer({ kind: 'progress' }, d.clientId())).catch(() => {});
    },
    view(): UiView {
      const first = dialogs[0];
      if (first && expired(first)) {
        // Queued past its timeout: skip it silently.
        dialogs = dialogs.slice(1);
        error = '';
        return api.view();
      }
      return { current: playback || modals > 0 || !first ? null : first, progress, error };
    },
    subscribe(fn: () => void) {
      subs.push(fn);
      return () => void subs.splice(subs.indexOf(fn), 1);
    },
  };
  return api;
}

// ---- poll loop ------------------------------------------------------------------------------------------------

export interface PollDeps {
  /** One long-poll; `batch` is missing on 204. `epoch` is the X-UI-Epoch header ('' when unreadable). `abort` cancels it. */
  poll(q: { since?: number; epoch?: string }): Promise<{ epoch: string; batch?: Batch }> & { abort?(): void };
  /** The server restarted (epoch changed). */
  onReset(): void;
  onBatch(b: Batch): void;
}

export function createPoller(d: PollDeps) {
  let gen = 0;
  let running = false;
  let paused = false;
  let wanted = false; // start() ran and stop() didn't: no polling before boot or while Setup is open
  let since: number | undefined;
  let epoch: string | undefined;
  let inflight: { abort?(): void } | undefined;
  let sleeper: ReturnType<typeof setTimeout> | undefined;

  const halt = () => {
    gen++;
    running = false;
    clearTimeout(sleeper);
    if (inflight && inflight.abort) inflight.abort();
    inflight = undefined;
  };
  const loop = async (g: number) => {
    let fails = 0;
    while (g === gen) {
      try {
        const p = d.poll({ since, epoch });
        inflight = p;
        const r = await p;
        if (g !== gen) return;
        fails = 0;
        const e = r.epoch || (r.batch && r.batch.epoch) || '';
        if (e) {
          if (epoch !== undefined && e !== epoch) d.onReset();
          epoch = e;
        }
        if (r.batch) {
          since = r.batch.seq;
          d.onBatch(r.batch);
        }
      } catch (e) {
        if (g !== gen) return;
        if (e instanceof ApiError && e.kind === 'unauthorized') return void (running = false); // Setup restarts us
        const ms = BACKOFF_MS[Math.min(fails++, BACKOFF_MS.length - 1)];
        await new Promise<void>((r) => (sleeper = setTimeout(r, ms)));
      }
    }
  };
  const run = () => {
    if (running || paused || !wanted) return;
    running = true;
    void loop(gen);
  };
  return {
    /** Starts the one loop (a running one is replaced); state of a previous server is forgotten. */
    start() {
      wanted = true;
      halt();
      since = epoch = undefined;
      run();
    },
    stop() {
      wanted = false;
      halt();
    },
    /** Hidden app: no polling; showing it again resumes from `since`. */
    setPaused(on: boolean) {
      paused = on;
      if (on) halt();
      else run();
    },
    get running() {
      return running;
    },
  };
}

// ---- wiring ---------------------------------------------------------------------------------------------------

let toastFn: (msg: string) => void = () => {};
/** ItemMenuHost's toast is registered here (kept out of the import graph of this module for tests). */
export const setToastSink = (f: (msg: string) => void) => (toastFn = f);

export const dispatcher = createDispatcher({
  toast: (m) => toastFn(m),
  send: (id, body) => post('/ui/requests/{id}', { path: { id }, body, quiet: true }),
  now: () => Date.now(),
  clientId,
});

const poller = createPoller({
  // A custom timeout also keeps the client from resending it after an outage; `meta` also gives the epoch header on 204.
  poll: ({ since, epoch }) => {
    const req = get('/ui/events', {
      query: { client_id: clientId(), since, epoch, wait: WAIT_S, lang: apiLang() },
      timeout: (WAIT_S + 10) * 1000,
      quiet: true,
      meta: true,
    });
    const p = req.then((r) => {
      const m = r as unknown as { epoch: string; body?: Batch };
      return { epoch: m.epoch, batch: m.body };
    }) as Promise<{ epoch: string; batch?: Batch }> & { abort(): void };
    p.abort = req.abort; // halt() must be able to cancel the open long-poll
    return p;
  },
  onReset: () => dispatcher.reset(),
  onBatch: (b) => dispatcher.handle(b.events || []),
});

if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => poller.setPaused(document.hidden));

/** A new server (or a restart after Setup): forget the old one's cards and dialogs. */
export const startUi = () => (dispatcher.reset(), poller.start());
export const stopUi = poller.stop;
