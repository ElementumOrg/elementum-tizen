import { useEffect, useState } from 'preact/hooks';
import { errorText, get, post, type Request } from '../api/client';
import type { components } from '../api/schema';
import { t } from '../i18n';
import { setTracker } from '../tracker';
import { Dialog } from './Dialog';
import { watchLogin } from './link-poll';
import { Spinner } from './Spinner';

type Code = components['schemas']['DeviceLoginCode'];
type State = { s: 'loading' } | { s: 'code'; code: Code; left: number } | { s: 'expired' } | { s: 'error'; e: unknown };

const mmss = (n: number) => Math.floor(n / 60) + ':' + ('0' + (n % 60)).slice(-2);

/** `req` with its result changed by `fn`, still abortable. */
export const mapRequest = <T, U>(req: Request<T>, fn: (v: T) => U): Request<U> => Object.assign(req.then(fn), { abort: req.abort });

/**
 * A device login: shows the code to enter on the site, with the time left. `start` asks Elementum for the code and
 * the count `check` must exceed once the login is done; `check` is polled. `onLinked` runs after `onClose`.
 */
export function DeviceLogin({ title, start, check, onClose, onLinked }: {
  title: string;
  start: () => Request<{ code: Code; logins: number }>;
  check: () => Request<number>;
  onClose: () => void;
  onLinked?: () => void;
}) {
  const [st, setSt] = useState<State>({ s: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setSt({ s: 'loading' });
    let stop = () => {};
    const req = start();
    req.then(
      ({ code, logins }) =>
        (stop = watchLogin({
          expiresIn: code.expires_in,
          interval: code.interval,
          logins,
          check,
          onTick: (left) => setSt({ s: 'code', code, left }),
          onLinked: () => (onClose(), onLinked && onLinked()),
          onExpired: () => setSt({ s: 'expired' }),
        })),
      (e) => e.code !== 'aborted' && setSt({ s: 'error', e }),
    );
    return () => (req.abort(), stop());
  }, [attempt]);

  const retry = { label: t('common.try_again'), onPress: () => setAttempt((n) => n + 1) };
  const cancel = { label: t('common.cancel'), onPress: onClose };
  return (
    <Dialog title={title} onClose={onClose} actions={st.s === 'expired' || st.s === 'error' ? [cancel, retry] : [cancel]}>
      {st.s === 'loading' && <Spinner />}
      {st.s === 'code' && (
        <div class="link-code">
          <p>{t('tracker.link_instructions', { url: st.code.verification_url })}</p>
          <div class="link-code-value">{st.code.user_code}</div>
          <p class="link-code-left">{t('tracker.link_expires', { time: mmss(st.left) })}</p>
        </div>
      )}
      {st.s === 'expired' && <p>{t('tracker.link_expired')}</p>}
      {st.s === 'error' && <p>{errorText(st.e)}</p>}
    </Dialog>
  );
}

/** Device login for the selected tracker; done once /system/info's `logins` grows. */
export function LinkTracker({ onClose, onLinked }: { onClose: () => void; onLinked?: () => void }) {
  return (
    <DeviceLogin
      title={t('tracker.link_account')}
      onClose={onClose}
      onLinked={onLinked}
      start={() => mapRequest(post('/tracker/authorize'), (login) => ({ code: login, logins: login.tracker.logins }))}
      check={() => mapRequest(get('/system/info', { quiet: true }), (i) => (i.tracker ? (setTracker(i.tracker), i.tracker.logins) : 0))}
    />
  );
}
