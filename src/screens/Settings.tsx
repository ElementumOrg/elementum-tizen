import { useEffect, useState } from 'preact/hooks';
import { errorText, get } from '../api/client';
import { openSetup } from '../connection';
import { setTracker } from '../tracker';
import { loadServer } from '../settings';
import { LANGUAGES, language, languageChoice, setLanguage, t } from '../i18n';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { LinkTracker } from '../ui/LinkTracker';
import { openKeyTest } from './KeyTest';
import { openSearchSettings } from './SearchSettings';

export function Settings() {
  // The error itself, not its text, so a language switch re-translates it.
  const [version, setVersion] = useState<{ v?: string; error?: unknown; tracker?: { name: string; authorized: boolean } | null }>({ v: '…' });
  const [linkOpen, setLinkOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const req = get('/system/info');
    req.then((info) => (setTracker(info.tracker), setVersion({ v: info.version, tracker: info.tracker })), (e) => e.code !== 'aborted' && setVersion({ error: e }));
    return req.abort;
  }, [reload]);

  const s = loadServer();
  const choice = languageChoice();
  const pick = (id: string) => {
    setLangOpen(false);
    setLanguage(id);
  };
  const mark = (id: string) => (id === choice ? '✓ ' : '');

  return (
    <div class="screen settings">
      <h1>{t('nav.settings')}</h1>
      <div class="settings-row">
        <span>{t('settings.server')}</span>
        <b>{`${s.ip}:${s.port}`}</b>
        <Button label={t('settings.change_server')} onPress={() => void openSetup().then(() => setReload((n) => n + 1))} />
      </div>
      <div class="settings-row">
        <span>{t('settings.language')}</span>
        <b>{LANGUAGES[language()] + (choice ? '' : ` (${t('settings.language_auto')})`)}</b>
        <Button label={t('settings.change_language')} onPress={() => setLangOpen(true)} />
      </div>
      {!version.error && version.v !== '…' && (
        <div class="settings-row">
          <span>{t('tracker.generic')}</span>
          <b>{version.tracker ? `${version.tracker.name}: ${t(version.tracker.authorized ? 'tracker.linked' : 'tracker.unlinked')}` : t('tracker.none')}</b>
          {version.tracker && <Button label={t(version.tracker.authorized ? 'tracker.link_again' : 'tracker.link_account')} onPress={() => setLinkOpen(true)} />}
        </div>
      )}
      <div class="settings-row">
        <span>{t('providers.builtin')}</span>
        <b />
        <Button label={t('providers.settings')} onPress={openSearchSettings} />
      </div>
      <div class="settings-row">
        <span>{t('settings.key_test')}</span>
        <Button label={t('settings.key_test')} onPress={openKeyTest} />
      </div>
      <h2>{t('settings.about')}</h2>
      <p>{t('settings.app_version', { version: __APP_VERSION__ })}</p>
      <p>{t('settings.elementum_version', { version: version.error ? errorText(version.error) : version.v! })}</p>
      {linkOpen && <LinkTracker onClose={() => (setLinkOpen(false), setReload((n) => n + 1))} />}
      {langOpen && (
        <Dialog
          title={t('settings.language')}
          onClose={() => setLangOpen(false)}
          actions={[{ label: mark('') + t('settings.language_auto'), onPress: () => pick('') }].concat(
            Object.keys(LANGUAGES).map((id) => ({ label: mark(id) + LANGUAGES[id], onPress: () => pick(id) })),
          )}
        />
      )}
    </div>
  );
}
