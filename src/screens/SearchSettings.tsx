// Settings > Built-in search settings: Elementum's own torrent search, as its Kodi dialog has it: providers and
// their logins, the general options, and the cookie sync with GitHub sign-in and Gist choice.
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { FocusContext, useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { ApiError, errorText, get, post, put } from '../api/client';
import { apiLang, t } from '../i18n';
import { useClaimFocus, useOnTop } from '../nav/focus';
import { stack } from '../nav/stack';
import { Dialog } from '../ui/Dialog';
import { ErrorView } from '../ui/ErrorView';
import { showToast } from '../ui/ItemMenu';
import { DeviceLogin, mapRequest } from '../ui/LinkTracker';
import { ListItem } from '../ui/ListItem';
import { Spinner } from '../ui/Spinner';
import { TextField } from '../ui/TextField';
import {
  enabledNames, groupOptions, isSecret, optionText, parseValue, providerLine, providersOf, valueText,
  type Gist, type Option, type Provider,
} from './search-settings-util';

export const openSearchSettings = () => stack.push(() => <SearchSettings />);

const failed = (e: unknown) => showToast(errorText(e));

/** A label with its value on the right. */
function SettingRow({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <ListItem cls="setting" onPress={onPress}>
      <span class="setting-label">{label}</span>
      <span class="setting-value">{value}</span>
    </ListItem>
  );
}

function SearchSettings() {
  const [data, setData] = useState<{ providers: Provider[]; options: Option[] } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [reload, setReload] = useState(0);
  const top = useOnTop(); // back from a provider list: show what changed there
  const lang = apiLang();
  useEffect(() => {
    if (!top) return;
    setError(null);
    const a = get('/providers');
    const b = get('/providers/options', { query: { lang } });
    Promise.all([a, b]).then(([providers, options]) => setData({ providers, options }), (e) => e.code !== 'aborted' && setError(e));
    return () => (a.abort(), b.abort());
  }, [lang, reload, top]);

  if (!data) return error ? <ErrorView message={errorText(error)} onRetry={() => setReload((n) => n + 1)} /> : <Spinner />;
  return (
    <Body
      providers={data.providers}
      options={data.options}
      setOption={(o) => setData((d) => d && { ...d, options: d.options.map((x) => (x.id === o.id ? { ...x, value: o.value } : x)) })}
      reload={() => setReload((n) => n + 1)}
    />
  );
}

function Body({ providers, options, setOption, reload }: {
  providers: Provider[];
  options: Option[];
  setOption: (o: Option) => void;
  reload: () => void;
}) {
  const box = useFocusable({ focusKey: 'search-settings' });
  useClaimFocus(box.focusKey, box.focusSelf);
  const [open, setOpen] = useState<{ edit?: Option; choose?: Option; login?: boolean; gists?: boolean }>({});
  const close = () => setOpen({});

  // The response's label is not in the screen's language, so only its value is taken.
  const save = (o: Option, value: unknown) =>
    put('/providers/options/{id}', { path: { id: o.id }, body: { value } }).then((r) => setOption({ ...o, value: r.value }), failed);
  const press = (o: Option) => {
    if (typeof o.value === 'boolean') void save(o, !o.value);
    else if (o.choices) setOpen({ choose: o });
    else setOpen({ edit: o });
  };
  const user = optionText(options, 'cookie_sync_user');

  return (
    <FocusContext.Provider value={box.focusKey}>
      <div ref={box.ref} class="screen search-settings">
        <h1>{t('providers.settings')}</h1>
        <SettingRow label={t('providers.public')} value={enabledNames(providers, false) || '–'} onPress={() => openProviders(false)} />
        <SettingRow label={t('providers.private')} value={enabledNames(providers, true) || '–'} onPress={() => openProviders(true)} />
        {groupOptions(options).map((g) => (
          <div key={g.name}>
            <h2>{g.name}</h2>
            {g.cookie && <SettingRow label={t('providers.github_user')} value={user || t('providers.connect_github')} onPress={() => setOpen({ login: true })} />}
            {g.cookie && user && <SettingRow label={t('providers.active_gist')} value={optionText(options, 'cookie_sync_info') || '–'} onPress={() => setOpen({ gists: true })} />}
            {g.options.map((o) => <SettingRow key={o.id} label={o.label} value={isSecret(o) && o.value ? t('providers.is_set') : valueText(o)} onPress={() => press(o)} />)}
          </div>
        ))}
        <div class="screen-end" />
      </div>
      {open.edit && <EditValue o={open.edit} onClose={close} onSave={(v) => (close(), void save(open.edit!, v))} />}
      {open.choose && (
        <Dialog title={open.choose.label} cls="menu" onClose={close}
          actions={open.choose.choices!.map((c, i) => ({ label: (i === open.choose!.value ? '✓ ' : '') + c, onPress: () => (close(), void save(open.choose!, i)) }))} />
      )}
      {open.login && (
        <DeviceLogin
          title={t('providers.connect_github')}
          onClose={close}
          onLinked={() => (reload(), setOpen({ gists: true }))}
          start={() => mapRequest(post('/providers/cookie-sync/login'), (code) => ({ code, logins: 0 }))}
          // Done when the account changes. shortcut: signing in again with the same account is not seen, so the
          // dialog stays until Cancel; a login counter in the API would tell it.
          check={() => mapRequest(get('/providers/options', { quiet: true }), (l) => {
            const now = optionText(l, 'cookie_sync_user');
            return now && now !== user ? 1 : 0;
          })}
        />
      )}
      {open.gists && <GistPicker file={optionText(options, 'cookie_sync_filename')} onClose={close} onPicked={() => (close(), reload())} onLogin={() => setOpen({ login: true })} />}
    </FocusContext.Provider>
  );
}

/** Edits a number or text; a token or password starts empty, and saving it empty keeps what is stored. */
function EditValue({ o, onClose, onSave }: { o: Option; onClose: () => void; onSave: (v: unknown) => void }) {
  const secret = isSecret(o);
  const [text, setText] = useState(secret || o.value === null || o.value === undefined ? '' : String(o.value));
  const submit = (v: string) => {
    if (secret && v === '') return onClose();
    const value = parseValue(o, v);
    if (value !== null) onSave(value);
  };
  return (
    <Dialog title={o.group} onClose={onClose}
      actions={[{ label: t('common.save'), onPress: () => submit(text) }, { label: t('common.cancel'), onPress: onClose }]}>
      <TextField label={o.label} value={text} onInput={setText} onSubmit={submit}
        type={secret ? 'password' : typeof o.default === 'number' ? 'number' : 'text'} />
    </Dialog>
  );
}

/** The cookie sync's Gists of the connected account; choosing one makes it the sync's. */
function GistPicker({ file, onClose, onPicked, onLogin }: { file: string; onClose: () => void; onPicked: () => void; onLogin: () => void }) {
  const [gists, setGists] = useState<Gist[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    const req = get('/providers/cookie-sync/gists');
    req.then(setGists, (e) => {
      if (e instanceof ApiError && e.code === 'tracker_not_authorized') onLogin(); // GitHub is not connected (any more)
      else if (e.code !== 'aborted') setError(e);
    });
    return req.abort;
  }, []);
  const pick = (g: Gist) =>
    put('/providers/options/{id}', { path: { id: 'cookie_sync_gist_id' }, body: { value: g.id } }).then(onPicked, failed);
  const cancel = { label: t('common.cancel'), onPress: onClose };
  return (
    <Dialog title={t('providers.select_gist')} cls="menu" onClose={onClose}
      actions={(gists || []).map((g): { label: string; onPress: () => void } => ({
        label: `${g.selected ? '✓ ' : ''}${g.description || g.id} · ${t('providers.gist_counts', { cookies: g.cookies, sites: g.sites })}`,
        onPress: () => void pick(g),
      })).concat([cancel])}>
      {!gists && !error && <Spinner />}
      {error && <p>{errorText(error)}</p>}
      {gists && gists.length === 0 && <p>{t('providers.no_gists', { file: file || '–' })}</p>}
    </Dialog>
  );
}

function openProviders(priv: boolean) {
  stack.push(() => <ProviderList priv={priv} />);
}

/** Public or private providers: OK switches a public one on or off; a private one opens its login. */
function ProviderList({ priv }: { priv: boolean }) {
  const [list, setList] = useState<Provider[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [reload, setReload] = useState(0);
  const [login, setLogin] = useState<Provider | null>(null);
  useEffect(() => {
    setError(null);
    const req = get('/providers');
    req.then((l) => setList(providersOf(l, priv)), (e) => e.code !== 'aborted' && setError(e));
    return req.abort;
  }, [reload]);
  const replace = (p: Provider) => setList((l) => l && l.map((x) => (x.id === p.id ? p : x)));
  const toggle = (p: Provider) => put('/providers/{id}', { path: { id: p.id }, body: { enabled: !p.enabled } }).then(replace, failed);

  if (!list) return error ? <ErrorView message={errorText(error)} onRetry={() => setReload((n) => n + 1)} /> : <Spinner />;
  return (
    <ProviderRows list={list} priv={priv} onPress={(p) => (priv ? setLogin(p) : void toggle(p))}>
      {login && <ProviderLogin p={login} onClose={() => setLogin(null)} onSaved={(p) => (setLogin(null), replace(p))} />}
    </ProviderRows>
  );
}

// Separate so the focus claim runs once the rows (not the spinner) are mounted.
function ProviderRows({ list, priv, onPress, children }: { list: Provider[]; priv: boolean; onPress: (p: Provider) => void; children: ComponentChildren }) {
  const box = useFocusable({ focusKey: 'provider-list' });
  useClaimFocus(box.focusKey, box.focusSelf);
  return (
    <FocusContext.Provider value={box.focusKey}>
      <div ref={box.ref} class="screen search-settings">
        <h1>{t(priv ? 'providers.private' : 'providers.public')}</h1>
        {list.map((p) => (
          <ListItem key={p.id} cls={'provider' + (p.enabled ? ' on' : '')} onPress={() => onPress(p)}>
            <div class="provider-name">{(p.enabled ? '✓ ' : '') + p.name}</div>
            <div class="provider-line">{providerLine(p, t('providers.no_login'))}</div>
          </ListItem>
        ))}
        <div class="screen-end" />
      </div>
      {children}
    </FocusContext.Provider>
  );
}

/** Switch and login of a private provider. Password and passkey are never sent back, so they start empty and stay as they are when left so. */
function ProviderLogin({ p, onClose, onSaved }: { p: Provider; onClose: () => void; onSaved: (p: Provider) => void }) {
  const [enabled, setEnabled] = useState(p.enabled);
  const [username, setUsername] = useState(p.username || '');
  const [password, setPassword] = useState('');
  const [passkey, setPasskey] = useState('');
  const set = p.has_secret ? ' ' + t('providers.is_set') : '';
  const save = () => {
    const body: { enabled: boolean; username: string; password?: string; passkey?: string } = { enabled, username };
    if (password) body.password = password;
    if (passkey) body.passkey = passkey;
    put('/providers/{id}', { path: { id: p.id }, body }).then(onSaved, failed);
  };
  return (
    <Dialog title={p.name} onClose={onClose} actions={[
      { label: enabled ? '✓ ' + t('providers.enabled') : t('providers.disabled'), onPress: () => setEnabled((v) => !v) },
      { label: t('common.save'), onPress: save },
      { label: t('common.cancel'), onPress: onClose },
    ]}>
      <TextField label={t('providers.username')} value={username} onInput={setUsername} />
      <TextField label={t('providers.password') + set} value={password} onInput={setPassword} type="password" />
      <TextField label={t('providers.passkey') + set} value={passkey} onInput={setPasskey} type="password" />
    </Dialog>
  );
}
