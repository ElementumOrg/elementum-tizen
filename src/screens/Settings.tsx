import { useEffect, useState } from 'preact/hooks';
import { errorText, get } from '../api/client';
import { openSetup } from '../connection';
import { setTracker } from '../tracker';
import { loadServer } from '../settings';
import { LANGUAGES, language, languageChoice, setLanguage, t } from '../i18n';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';

export function Settings() {
  // The error itself, not its text, so a language switch re-translates it.
  const [version, setVersion] = useState<{ v?: string; error?: unknown }>({ v: '…' });
  const [langOpen, setLangOpen] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const req = get('/system/info');
    req.then((info) => (setTracker(info.tracker), setVersion({ v: info.version })), (e) => e.code !== 'aborted' && setVersion({ error: e }));
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
      <h2>{t('settings.about')}</h2>
      <p>{t('settings.app_version', { version: __APP_VERSION__ })}</p>
      <p>{t('settings.elementum_version', { version: version.error ? errorText(version.error) : version.v! })}</p>
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
