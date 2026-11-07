// Connection flow: the waiting dialog after network errors and Setup on 401, wired into the API client.
import { useEffect, useState } from 'preact/hooks';
import { get, hooks, isNetworkError } from './api/client';
import { createWaiter } from './api/waiter';
import { exitApp, stack } from './nav/stack';
import { loadServer } from './settings';
import { t } from './i18n';
import { Dialog, ExitDialog } from './ui/Dialog';
import { Spinner } from './ui/Spinner';
import { Setup } from './screens/Setup';

const subs: Array<() => void> = [];
const emit = () => subs.forEach((f) => f());

const waiter = createWaiter(() => get('/system/info', { quiet: true, timeout: 3000 }), isNetworkError, emit);
document.addEventListener('visibilitychange', () => waiter.setPaused(document.hidden));

let setupOpen: Promise<void> | null = null;
let booted = false;

/** Boot calls this once Root is up; before that, Back on Setup asks to exit. */
export function markBooted() {
  booted = true;
}

export const setupIsOpen = () => setupOpen !== null;

/** Pushes Setup (once, even when several calls get a 401); resolves when it closes. */
export function openSetup(): Promise<void> {
  if (!setupOpen) {
    setupOpen = new Promise((resolve) => {
      const close = () => {
        setupOpen = null;
        stack.pop();
        emit();
        resolve();
      };
      stack.push(() => <Setup onClose={close} exitOnBack={() => !booted} />);
    });
    emit();
  }
  return setupOpen;
}

hooks.waitForServer = () => waiter.wait();
hooks.unauthorized = () => void openSetup();

/** Global (outside the stack): "Waiting for Elementum…" while the server is down; hidden while Setup is open. */
export function WaitingDialog() {
  const [, rerender] = useState(0);
  const [confirmExit, setConfirmExit] = useState(false);
  useEffect(() => {
    const f = () => rerender((n) => n + 1);
    subs.push(f);
    return () => void subs.splice(subs.indexOf(f), 1);
  }, []);
  if (!waiter.waiting || setupOpen) return null;
  if (confirmExit) return <ExitDialog onClose={() => setConfirmExit(false)} />;
  const s = loadServer();
  return (
    <Dialog
      title={t('waiting.title', { server: `${s.ip}:${s.port}` })}
      onClose={() => setConfirmExit(true)}
      actions={[
        { label: t('waiting.change_server'), onPress: () => void openSetup() },
        { label: t('waiting.exit'), onPress: exitApp },
      ]}
    >
      <Spinner />
    </Dialog>
  );
}
