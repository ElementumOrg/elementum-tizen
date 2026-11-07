import { useContext, useEffect, useRef, useState } from 'preact/hooks';
import { errorText, get, type Request } from '../api/client';
import { onKey } from '../nav/keys';
import { LayerContext } from '../nav/stack';
import { cleanServer, loadServer, saveServer, type Server } from '../settings';
import { t } from '../i18n';
import { TextField } from '../ui/TextField';
import { Button } from '../ui/Button';
import { ExitDialog } from '../ui/Dialog';

// Kept untranslated in state, so a language switch re-translates it.
type Status = { key: string; vars?: Record<string, string> } | { error: unknown } | null;

interface SetupProps {
  onClose: () => void;
  /** First run: nothing to go back to, so Back asks to exit. */
  exitOnBack: () => boolean;
}

/** Server address and login. Shown on first run, on 401 and from Settings; Back or Save closes it. */
export function Setup({ onClose, exitOnBack }: SetupProps) {
  const layer = useContext(LayerContext);
  const [server, setServer] = useState(loadServer);
  const [status, setStatus] = useState<Status>(null);
  const [exitOpen, setExitOpen] = useState(false);
  const testing = useRef<Request<unknown> | null>(null);

  useEffect(() => {
    const off = onKey((action) => action === 'back' && (exitOnBack() ? setExitOpen(true) : onClose(), true), { layer });
    return () => {
      off();
      if (testing.current) testing.current.abort();
    };
  }, []);

  const field = (key: keyof Server) => (value: string) => setServer((s) => Object.assign({}, s, { [key]: value }));
  const valid = (): Server | null => {
    const r = cleanServer(server);
    if ('error' in r) setStatus({ key: r.error });
    return 'server' in r ? r.server : null;
  };

  const test = () => {
    const s = valid();
    if (!s) return;
    if (testing.current) testing.current.abort();
    setStatus({ key: 'setup.testing' });
    const req = get('/system/info', { server: s, quiet: true });
    testing.current = req;
    req.then(
      (info) => setStatus({ key: 'setup.ok', vars: { version: info.version } }),
      (e) => req === testing.current && e.code !== 'aborted' && setStatus({ error: e }),
    );
  };

  const saveAndClose = () => {
    const s = valid();
    if (!s) return;
    saveServer(s);
    onClose();
  };

  return (
    <div class="screen setup">
      <h1>{t('setup.title')}</h1>
      <p class="hint">{t('setup.hint')}</p>
      <TextField label={t('setup.ip')} value={server.ip} onInput={field('ip')} />
      <TextField label={t('setup.port')} type="number" value={server.port} onInput={field('port')} />
      <TextField label={t('setup.user')} value={server.user} onInput={field('user')} />
      <TextField label={t('setup.password')} type="password" value={server.password} onInput={field('password')} />
      <div class="setup-actions">
        <Button label={t('setup.test')} onPress={test} />
        <Button label={t('setup.save')} onPress={saveAndClose} />
      </div>
      <p class="status">{status && ('error' in status ? errorText(status.error) : t(status.key, status.vars))}</p>
      {exitOpen && <ExitDialog onClose={() => setExitOpen(false)} />}
    </div>
  );
}
