import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ApiError, del, errorText, get, hooks, post } from '../src/api/client';

class FakeXHR {
  static all: FakeXHR[] = [];
  method = '';
  url = '';
  headers: Record<string, string> = {};
  timeout = 0;
  status = 0;
  responseText = '';
  sent: unknown;
  onload?: () => void;
  onerror?: () => void;
  ontimeout?: () => void;
  onabort?: () => void;
  constructor() {
    FakeXHR.all.push(this);
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(k: string, v: string) {
    this.headers[k] = v;
  }
  send(body?: unknown) {
    this.sent = body;
  }
  abort() {
    if (this.onabort) this.onabort();
  }
  respond(status: number, body: string) {
    this.status = status;
    this.responseText = body;
    this.onload!();
  }
}
const last = () => FakeXHR.all[FakeXHR.all.length - 1];
const server = { ip: '10.0.0.5', port: '65220', user: '', password: '' };
const fail = (p: Promise<unknown>) => p.then(() => { throw new Error('resolved'); }, (e: ApiError) => e);

beforeEach(() => {
  FakeXHR.all = [];
  vi.stubGlobal('XMLHttpRequest', FakeXHR);
  hooks.waitForServer = null;
  hooks.unauthorized = () => {};
});
afterEach(() => vi.unstubAllGlobals());

test('builds the URL from settings, path params and query; parses JSON', async () => {
  vi.stubGlobal('localStorage', { getItem: (k: string) => ({ 'elementum.ip': '192.168.1.2' } as Record<string, string>)[k] || null });
  const req = get('/movies/lists/{list}', { path: { list: 'top_rated' }, query: { page: 2, lang: 'de-DE', genre: undefined } });
  const x = last();
  expect(x.method).toBe('GET');
  expect(x.url).toBe('http://192.168.1.2:65220/api/v1/movies/lists/top_rated?page=2&lang=de-DE');
  expect(x.timeout).toBe(75000);
  expect(x.headers.Authorization).toBeUndefined();
  x.respond(200, '{"items":[{"title":"Ä"}],"page":2}');
  expect(await req).toEqual({ items: [{ title: 'Ä' }], page: 2 });
});

test('list GETs get a 75 s default timeout (custom wins); other GETs 15 s', () => {
  for (const [path, ms] of [['/tracker/lists', 75000], ['/movies/genres', 75000], ['/library/shows', 75000], ['/system/info', 15000], ['/movies/{tmdb_id}', 15000]] as const) {
    get(path as any, { server, path: { tmdb_id: 1 } as any });
    expect(last().timeout).toBe(ms);
  }
  get('/movies/lists/{list}', { server, path: { list: 'popular' }, timeout: 3000 });
  expect(last().timeout).toBe(3000);
});

test('Basic auth header (UTF-8), JSON body, timeout override, empty 204', async () => {
  const req = post('/playback', {
    server: { ip: 'h', port: '1', user: 'jö', password: 'p:w' },
    body: { uri: 'magnet:?x', type: 'movie', tmdb_id: 1 },
    timeout: 60000,
  });
  const x = last();
  expect(x.headers.Authorization).toBe('Basic asO2OnA6dw=='); // UTF-8 'jö:p:w'
  expect(x.headers['Content-Type']).toBe('application/json');
  expect(JSON.parse(x.sent as string)).toEqual({ uri: 'magnet:?x', type: 'movie', tmdb_id: 1 });
  expect(x.timeout).toBe(60000);
  x.respond(201, '{"id":"s1"}');
  expect(await req).toEqual({ id: 's1' });

  const d = del('/playback/{id}', { server, path: { id: 'a/b' } });
  expect(last().url).toBe('http://10.0.0.5:65220/api/v1/playback/a%2Fb');
  last().respond(204, '');
  expect(await d).toBeUndefined();
});

test('maps network error, timeout, 401, API error and bad JSON', async () => {
  let r = get('/system/info', { server });
  last().onerror!();
  expect(await fail(r)).toMatchObject({ kind: 'network', status: 0 });

  r = get('/system/info', { server });
  last().ontimeout!();
  expect(await fail(r)).toMatchObject({ kind: 'network', code: 'timeout' });

  r = get('/system/info', { server });
  last().respond(409, '{"error":{"code":"tracker_not_authorized","message":"No tracker account linked"}}');
  const e = await fail(r);
  expect(e).toMatchObject({ kind: 'api', status: 409, code: 'tracker_not_authorized', message: 'No tracker account linked' });
  expect(errorText(e)).toBe('No tracker account linked');

  r = get('/system/info', { server });
  last().respond(502, '<html>Bad Gateway from some proxy</html>');
  const bad = await fail(r);
  expect(bad).toMatchObject({ kind: 'api', status: 502, code: 'http_502', message: '' });
  expect(errorText(bad)).toBe('Elementum returned an error (http_502).');

  r = get('/system/info', { server });
  last().respond(200, 'not json');
  expect(await fail(r)).toMatchObject({ kind: 'api', code: 'bad_response' });
});

test('abort rejects with an aborted network error', async () => {
  const r = get('/system/info', { server });
  r.abort();
  expect(await fail(r)).toMatchObject({ kind: 'network', code: 'aborted' });
});

test('401 calls hooks.unauthorized (opens Setup); quiet skips it', async () => {
  let unauthorized = 0;
  hooks.unauthorized = () => unauthorized++;
  let r = get('/system/info', { server });
  last().respond(401, '{"error":{"code":"unauthorized","message":"login required"}}');
  expect(await fail(r)).toMatchObject({ kind: 'unauthorized', status: 401 });
  expect(unauthorized).toBe(1);

  r = get('/system/info', { server, quiet: true });
  last().respond(401, '');
  expect(await fail(r)).toMatchObject({ kind: 'unauthorized' });
  expect(unauthorized).toBe(1);
});

test('an unusable address becomes a bad_url error', async () => {
  class BadOpen extends FakeXHR {
    open() {
      throw new SyntaxError("Failed to execute 'open': Invalid URL");
    }
  }
  vi.stubGlobal('XMLHttpRequest', BadOpen);
  const e = await fail(get('/system/info', { server: { ip: 'a b', port: '1', user: '', password: '' } }));
  expect(e).toBeInstanceOf(ApiError);
  expect(e).toMatchObject({ kind: 'api', status: 0, code: 'bad_url' });
  expect(errorText(e)).toBe('The server address is not valid.');
});

/** A waitForServer stub: each call returns a handle whose `done` resolves via release(wasDown). */
function stubWait() {
  const calls: { release: (down: boolean) => void; left: boolean }[] = [];
  hooks.waitForServer = () => {
    const c = { release: (_: boolean) => {}, left: false };
    calls.push(c);
    return { done: new Promise<boolean>((r) => (c.release = r)), leave: () => void (c.left = true) };
  };
  return calls;
}
const tick = () => new Promise((r) => setTimeout(r, 0));

test('a GET that hits a dead server waits, then is resent', async () => {
  const calls = stubWait();
  const r = get('/movies/genres', { server });
  last().onerror!();
  await tick();
  expect(calls.length).toBe(1);
  expect(FakeXHR.all.length).toBe(1);
  calls[0].release(true);
  await tick();
  expect(FakeXHR.all.length).toBe(2);
  last().respond(200, '[{"id":1,"name":"Action"}]');
  expect(await r).toEqual([{ id: 1, name: 'Action' }]);
});

test('if the server was up after all (e.g. a slow call timed out), the original error is rethrown', async () => {
  const calls = stubWait();
  const r = get('/movies/genres', { server });
  last().ontimeout!();
  await tick();
  calls[0].release(false);
  expect(await fail(r)).toMatchObject({ kind: 'network', code: 'timeout' });
  expect(FakeXHR.all.length).toBe(1);
});

test('POST, DELETE, custom-timeout and quiet calls never wait or resend', async () => {
  const calls = stubWait();
  const cases = [
    post('/playback', { server, body: { uri: 'magnet:?x', type: 'movie', tmdb_id: 1 } }),
    del('/playback/{id}', { server, path: { id: 'x' }, quiet: true }),
    get('/movies/{tmdb_id}/streams', { server, path: { tmdb_id: 1 }, timeout: 60000 }),
    get('/system/info', { server, quiet: true }),
  ];
  FakeXHR.all.forEach((x) => x.ontimeout!());
  for (const c of cases) expect(await fail(c)).toMatchObject({ kind: 'network', code: 'timeout' });
  expect(calls.length).toBe(0);
  expect(FakeXHR.all.length).toBe(4);
});

test('abort while waiting leaves the wait and rejects with aborted', async () => {
  const calls = stubWait();
  const r = get('/system/info', { server });
  last().onerror!();
  await tick();
  r.abort();
  expect(await fail(r)).toMatchObject({ code: 'aborted' });
  expect(calls[0].left).toBe(true);
  calls[0].release(true);
  await tick();
  expect(FakeXHR.all.length).toBe(1);
});
