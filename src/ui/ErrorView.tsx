import { FocusContext, useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { useClaimFocus } from '../nav/focus';
import { t } from '../i18n';
import { Button } from './Button';

export function ErrorView({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { ref, focusKey, focusSelf } = useFocusable();
  useClaimFocus(focusKey, focusSelf);
  return (
    <FocusContext.Provider value={focusKey}>
      <div ref={ref} class="error-view">
        <p>{message}</p>
        <Button label={t('common.retry')} onPress={onRetry} />
      </div>
    </FocusContext.Provider>
  );
}
