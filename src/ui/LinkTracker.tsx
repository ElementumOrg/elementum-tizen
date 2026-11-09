import { useEffect, useState } from 'preact/hooks';
import { errorText, get, post } from '../api/client';
import type { components } from '../api/schema';
import { t } from '../i18n';
import { setTracker } from '../tracker';
import { Dialog } from './Dialog';
import { watchLogin } from './link-poll';
import { Spinner } from './Spinner';

type Login = components['schemas']['TrackerAuthCode'];
type State = { s: 'loading' } | { s: 'code'; login: Login; left: number } | { s: 'expired' } | { s: 'error'; e: unknown };

const mmss = (n: number) => Math.floor(n / 60) + ':' + ('0' + (n % 60)).slice(-2);

/** Device login for the selected tracker: shows a code to enter on the tracker's site; calls `onLinked` (after `onClose`) once /system/info's `logins` grows. */
export function LinkTracker({ onClose, onLinked }: { onClose: () => void; onLinked?: () => void }) {
  const [st, setSt] = useState<State>({ s: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setSt({ s: 'loading' });
    let stop = () => {};
    const req = post('/tracker/authorize');
    req.then(
      (login) =>
        (stop = watchLogin({
          expiresIn: login.expires_in,
          interval: login.interval,
          logins: login.tracker.logins,
          check: () => {
            const r = get('/system/info', { quiet: true });
            return Object.assign(r.then((i) => (i.tracker ? (setTracker(i.tracker), i.tracker.logins) : 0)), { abort: r.abort });
          },
          onTick: (left) => setSt({ s: 'code', login, left }),
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
    <Dialog title={t('tracker.link_account')} onClose={onClose} actions={st.s === 'expired' || st.s === 'error' ? [cancel, retry] : [cancel]}>
      {st.s === 'loading' && <Spinner />}
      {st.s === 'code' && (
        <div class="link-code">
          <p>{t('tracker.link_instructions', { url: st.login.verification_url })}</p>
          <div class="link-code-value">{st.login.user_code}</div>
          <p class="link-code-left">{t('tracker.link_expires', { time: mmss(st.left) })}</p>
        </div>
      )}
      {st.s === 'expired' && <p>{t('tracker.link_expired')}</p>}
      {st.s === 'error' && <p>{errorText(st.e)}</p>}
    </Dialog>
  );
}
