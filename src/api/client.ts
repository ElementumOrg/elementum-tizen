// Thin typed client for Elementum's /api/v1. XHR, not fetch: Chrome 56 has no AbortController.
import type { paths } from './schema';
import { loadServer, type Server } from '../settings';
import { t } from '../i18n';

export type ErrorKind = 'network' | 'unauthorized' | 'api';

/**
 * network: status 0, timeout (code 'timeout') or abort (code 'aborted'); unauthorized: 401;
 * api: any other non-2xx, with the server's `error.code` and `error.message` (never the raw body).
 */
export class ApiError extends Error {
  constructor(public kind: ErrorKind, public status: number, public code = '', message = '') {
    super(message);
  }
}

export const isNetworkError = (e: unknown) => e instanceof ApiError && e.kind === 'network';

/** Set by the connection flow (connection.tsx): wait for the server after a network error, open Setup on 401. */
export const hooks = {
  /** `done` is true when the server was really down (then the call is resent); `leave` drops this caller. */
  waitForServer: null as null | (() => { done: Promise<boolean>; leave(): void }),
  unauthorized: () => {},
};

export const DEFAULT_TIMEOUT = 15000;
/** Lists (Elementum can take 40-60 s to build one) get a longer default (75 s); still "not custom", so they are resent after an outage. */
export const LIST_TIMEOUT = 75000;
const isList = (path: string) => /^\/(library|search|tracker|trakt)\b|\/(lists|genres)\b/.test(path);

type Method = 'get' | 'post' | 'delete';
type PathsWith<M extends Method> = { [P in keyof paths]: [NonNullable<paths[P][M]>] extends [never] ? never : P }[keyof paths];
type Op<P extends keyof paths, M extends Method> = NonNullable<paths[P][M]>;
type Json<R> = R extends { content: { 'application/json': infer T } } ? T : void;
type Ok<O> = O extends { responses: infer R } ? Json<R[keyof R & (200 | 201 | 204)]> : never;
type Params<O> = O extends { parameters: infer P } ? P : never;
type Body<O> = O extends { requestBody: { content: { 'application/json': infer B } } } ? B : never;

export interface Options<O> {
  path?: Params<O> extends { path?: infer X } ? X : never;
  query?: Params<O> extends { query?: infer X } ? X : never;
  body?: Body<O>;
  /** ms; default 15 s (75 s for list GETs). Stream search passes 60 s; a call with its own timeout is never resent. */
  timeout?: number;
  /**
   * Skip the waiting dialog and the 401 → Setup handling: Setup's own test, the waiting dialog's probe,
   * and playback progress/DELETE (no dialog over the player or after leaving a screen).
   */
  quiet?: boolean;
  /** Use this server instead of the saved one (Setup's "Test connection"). */
  server?: Server;
}

/** A promise with a way to cancel it; abort rejects it with a network error with code 'aborted'. */
export type Request<T> = Promise<T> & { abort(): void };

export const get = <P extends PathsWith<'get'>>(path: P, opts: Options<Op<P, 'get'>> = {}) =>
  request<Ok<Op<P, 'get'>>>('GET', path, opts);
export const post = <P extends PathsWith<'post'>>(path: P, opts: Options<Op<P, 'post'>> = {}) =>
  request<Ok<Op<P, 'post'>>>('POST', path, opts);
export const del = <P extends PathsWith<'delete'>>(path: P, opts: Options<Op<P, 'delete'>> = {}) =>
  request<Ok<Op<P, 'delete'>>>('DELETE', path, opts);

export function baseUrl(s: Server) {
  return `http://${s.ip}:${s.port}/api/v1`;
}

function buildUrl(s: Server, path: string, params: unknown, query: unknown) {
  const p = (params || {}) as Record<string, unknown>;
  const url = baseUrl(s) + path.replace(/\{(\w+)\}/g, (_, k: string) => encodeURIComponent(String(p[k])));
  const q = (query || {}) as Record<string, unknown>;
  const parts: string[] = [];
  for (const k in q) if (q[k] != null) parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(q[k])));
  return parts.length ? url + '?' + parts.join('&') : url;
}

function request<T>(method: string, path: string, opts: Options<unknown>): Request<T> {
  let xhr: XMLHttpRequest | undefined;
  let waiting: { leave(): void } | null = null;
  let aborted = false;
  let fail: (e: ApiError) => void = () => {};

  const run = async (): Promise<T> => {
    for (;;) {
      let err: ApiError;
      try {
        const s = opts.server || loadServer();
        xhr = new XMLHttpRequest();
        return await send<T>(xhr, method, path, buildUrl(s, path, opts.path, opts.query), s, opts);
      } catch (e) {
        // Anything else comes from xhr.open/send, e.g. a SyntaxError for an unusable host.
        err = e instanceof ApiError ? e : new ApiError('api', 0, 'bad_url');
      }
      if (aborted || opts.quiet) throw err;
      if (err.kind === 'unauthorized') hooks.unauthorized();
      // Only plain GETs are resent: POST/DELETE aren't idempotent, and a custom timeout means a slow call.
      if (err.kind !== 'network' || method !== 'GET' || opts.timeout || !hooks.waitForServer) throw err;
      const w = hooks.waitForServer();
      waiting = w;
      const wasDown = await w.done;
      waiting = null;
      if (aborted || !wasDown) throw err;
    }
  };

  const promise = new Promise<T>((resolve, reject) => {
    fail = reject;
    run().then(resolve, reject);
  }) as Request<T>;
  promise.abort = () => {
    aborted = true;
    if (xhr) xhr.abort();
    if (waiting) waiting.leave();
    fail(new ApiError('network', 0, 'aborted'));
  };
  return promise;
}

function send<T>(xhr: XMLHttpRequest, method: string, path: string, url: string, s: Server, opts: Options<unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    xhr.open(method, url);
    xhr.timeout = opts.timeout || (method === 'GET' && isList(path) ? LIST_TIMEOUT : DEFAULT_TIMEOUT);
    xhr.setRequestHeader('Accept', 'application/json');
    if (s.user || s.password) {
      // UTF-8 bytes, as Go compares them; btoa alone only takes Latin-1.
      xhr.setRequestHeader('Authorization', 'Basic ' + btoa(unescape(encodeURIComponent(s.user + ':' + s.password))));
    }
    xhr.onerror = () => reject(new ApiError('network', 0));
    xhr.ontimeout = () => reject(new ApiError('network', 0, 'timeout'));
    xhr.onabort = () => reject(new ApiError('network', 0, 'aborted'));
    xhr.onload = () => {
      const status = xhr.status;
      let json: any;
      try {
        json = xhr.responseText ? JSON.parse(xhr.responseText) : undefined;
      } catch (_) {
        json = undefined;
        if (status >= 200 && status < 300) return reject(new ApiError('api', status, 'bad_response'));
      }
      if (status >= 200 && status < 300) return resolve(json as T);
      const body = json && json.error && typeof json.error === 'object' ? json.error : {};
      const message = typeof body.message === 'string' ? body.message : '';
      if (status === 0) reject(new ApiError('network', 0));
      else if (status === 401) reject(new ApiError('unauthorized', 401, 'unauthorized', message));
      else reject(new ApiError('api', status, typeof body.code === 'string' ? body.code : 'http_' + status, message));
    };
    if (opts.body === undefined) xhr.send();
    else {
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(JSON.stringify(opts.body));
    }
  });
}

/** User-facing text for any error from this client; server text is limited to `error.message`. */
export function errorText(e: unknown): string {
  if (!(e instanceof ApiError)) return t('error.unknown');
  if (e.kind === 'network') return t('error.network');
  if (e.kind === 'unauthorized') return t('error.unauthorized');
  if (e.code === 'bad_url') return t('error.bad_url');
  return e.message || t('error.api', { code: e.code });
}
