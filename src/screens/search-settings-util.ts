import type { components } from '../api/schema';

export type Provider = components['schemas']['Provider'];
export type Option = components['schemas']['ProviderOption'];
export type Gist = components['schemas']['CookieSyncGist'];

/** Cookie sync options with rows of their own (GitHub sign-in, Gist choice) instead of a plain value. */
export const OWN_ROWS = ['cookie_sync_token', 'cookie_sync_user', 'cookie_sync_info', 'cookie_sync_gist_id'];

/** Options by group in the server's order, without OWN_ROWS; `cookie` marks the cookie sync group. */
export function groupOptions(options: Option[]) {
  const groups: { name: string; options: Option[]; cookie: boolean }[] = [];
  for (const o of options) {
    let g = groups.filter((x) => x.name === o.group)[0];
    if (!g) groups.push((g = { name: o.group, options: [], cookie: false }));
    if (o.id.indexOf('cookie_sync_') === 0) g.cookie = true;
    if (OWN_ROWS.indexOf(o.id) < 0) g.options.push(o);
  }
  return groups;
}

/** A token or password: the server only says whether it is set, so it is edited from empty. */
export const isSecret = (o: Option) => o.value === '********' || /password|token/.test(o.id);

/** The value as shown: ✓ or – for a switch, the name of a choice, – for empty text. */
export function valueText(o: Option): string {
  const v = o.value;
  if (typeof v === 'boolean') return v ? '✓' : '–';
  if (o.choices && typeof v === 'number' && o.choices[v] !== undefined) return o.choices[v];
  if (v === '' || v === null || v === undefined) return '–';
  return String(v);
}

/** The value to send for an edited text: a number for a number option (null when it isn't one), else the text. */
export function parseValue(o: Option, text: string): unknown {
  if (typeof o.default !== 'number') return text;
  const n = Number(text.trim().replace(',', '.'));
  return text.trim() !== '' && isFinite(n) ? n : null;
}

/** Value of an option by id, '' when it is missing or not text. */
export const optionText = (options: Option[], id: string) => {
  const o = options.filter((x) => x.id === id)[0];
  return o && typeof o.value === 'string' ? o.value : '';
};

/** Names of the enabled providers of one kind, for the summary line. */
export const enabledNames = (providers: Provider[], priv: boolean) =>
  providers.filter((p) => p.private === priv && p.enabled).map((p) => p.name).join(', ');

/**
 * The parts of a provider's second line: its languages; for a private one the account (or `noLogin`);
 * and why an enabled one is not searched, unless that is the missing login already shown.
 */
export function providerLine(p: Provider, noLogin: string): string {
  const parts = [p.languages.join(', ')];
  const login = p.username || p.has_secret || p.has_cookies;
  if (p.private) parts.push(p.username || (login ? '' : noLogin));
  if (p.enabled && !p.searched && p.reason && !(p.private && !login)) parts.push(p.reason);
  return parts.filter(Boolean).join(' · ');
}

/** Providers of one kind, by name. */
export const providersOf = (all: Provider[], priv: boolean) =>
  all.filter((p) => p.private === priv).sort((a, b) => (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1));
