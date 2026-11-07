import type { ComponentChildren } from 'preact';
import { FocusContext, useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { useClaimFocus } from '../nav/focus';
import { t } from '../i18n';
import { Button } from './Button';

/** `children` adds more actions after Retry. */
export function ErrorView({ message, onRetry, children }: { message: string; onRetry: () => void; children?: ComponentChildren }) {
  const { ref, focusKey, focusSelf } = useFocusable();
  useClaimFocus(focusKey, focusSelf);
  return (
    <FocusContext.Provider value={focusKey}>
      <div ref={ref} class="error-view">
        <p>{message}</p>
        <Button label={t('common.retry')} onPress={onRetry} />
        {children}
      </div>
    </FocusContext.Provider>
  );
}
