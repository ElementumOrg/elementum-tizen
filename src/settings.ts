// App settings in localStorage. Every access is guarded: storage can be missing or throw (private mode, quota).
export const DEFAULT_PORT = '65220';

export type SettingKey = 'ip' | 'port' | 'user' | 'password' | 'language' | 'recent';

export function load(key: SettingKey): string {
  try {
    return localStorage.getItem('elementum.' + key) || '';
  } catch (_) {
    return '';
  }
}

/** An empty value removes the key, so it falls back to its default. */
export function save(key: SettingKey, value: string) {
  try {
    if (value) localStorage.setItem('elementum.' + key, value);
    else localStorage.removeItem('elementum.' + key);
  } catch (_) {
    // Not persisted; the app keeps working for this session.
  }
}

export interface Server {
  ip: string;
  port: string;
  user: string;
  password: string;
}

export function loadServer(): Server {
  return { ip: load('ip'), port: load('port') || DEFAULT_PORT, user: load('user'), password: load('password') };
}

export function saveServer(s: Server) {
  save('ip', s.ip);
  save('port', s.port);
  save('user', s.user);
  save('password', s.password);
}

/**
 * Validates what the user typed in Setup. Strips a pasted `http://` and path, wraps a bare IPv6 in [],
 * and rejects an `ip:port` with its own message. Returns the server, or an i18n key for the error.
 */
export function cleanServer(input: Server): { server: Server } | { error: string } {
  let ip = input.ip.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  const port = Number(input.port.trim());
  if (/^[0-9a-f]*:[0-9a-f]*:[0-9a-f:.]*$/i.test(ip)) ip = `[${ip}]`; // bare IPv6
  else if (/^[\w.-]+:\d*$/.test(ip)) return { error: 'setup.ip_with_port' };
  else if (!/^[\w.-]+$/.test(ip) && !/^\[[0-9a-f:.]+\]$/i.test(ip)) return { error: 'setup.invalid_ip' };
  if (!(port >= 1 && port <= 65535 && port % 1 === 0)) return { error: 'setup.invalid_port' };
  return { server: { ip, port: String(port), user: input.user, password: input.password } };
}

export const RECENT_MAX = 10;

/** Puts `q` first, drops its earlier copy (case-insensitive) and keeps the newest RECENT_MAX. */
export function addRecent(list: string[], q: string): string[] {
  const low = q.toLowerCase();
  return [q].concat(list.filter((x) => x.toLowerCase() !== low)).slice(0, RECENT_MAX);
}

export function loadRecent(): string[] {
  try {
    const v = JSON.parse(load('recent'));
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, RECENT_MAX) : [];
  } catch (_) {
    return [];
  }
}

export const saveRecent = (list: string[]) => save('recent', list.length ? JSON.stringify(list) : '');
