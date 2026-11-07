import type { ComponentChildren } from 'preact';
import { useContext, useEffect, useRef } from 'preact/hooks';
import { FocusContext, getCurrentFocusKey, setFocus, useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { onKey } from '../nav/keys';
import { exitApp, LayerContext, stack } from '../nav/stack';
import { t } from '../i18n';
import { Button } from './Button';

interface DialogProps {
  title: string;
  actions: { label: string; onPress: () => void }[];
  /** Back closes the dialog through this. */
  onClose: () => void;
  /** Shown between the title and the actions. */
  children?: ComponentChildren;
}

/**
 * Modal: arrows stay inside, Back closes it, and focus returns to where it was.
 * Opened on a hidden lower layer, it takes no keys or focus; it becomes that layer's restore target on pop instead.
 */
export function Dialog({ title, actions, onClose, children }: DialogProps) {
  const layer = useContext(LayerContext);
  const { ref, focusKey, focusSelf } = useFocusable({ isFocusBoundary: true });
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const entry = stack.entries.find((e) => e.id === layer);
    let prev: string | undefined;
    if (stack.isTop(layer)) {
      prev = getCurrentFocusKey();
      focusSelf();
    } else if (entry) {
      prev = entry.focus;
      entry.focus = focusKey;
    }
    const off = onKey((action) => action === 'back' && (close.current(), true), layer ? { layer } : { global: true });
    return () => {
      off();
      if (stack.isTop(layer)) {
        if (prev) void setFocus(prev);
      } else if (entry) {
        entry.focus = prev;
      }
    };
  }, []);

  return (
    <FocusContext.Provider value={focusKey}>
      <div class="dialog-backdrop">
        <div ref={ref} class="dialog">
          <h2>{title}</h2>
          {children}
          {actions.map((a) => <Button key={a.label} label={a.label} onPress={a.onPress} />)}
        </div>
      </div>
    </FocusContext.Provider>
  );
}

/** "Exit Elementum?" confirm; No (or Back) calls onClose. */
export function ExitDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog
      title={t('exit.title')}
      onClose={onClose}
      actions={[
        { label: t('common.no'), onPress: onClose },
        { label: t('common.yes'), onPress: () => (exitApp(), onClose()) }, // exit does nothing in a browser
      ]}
    />
  );
}
