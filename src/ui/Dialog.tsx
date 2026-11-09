import type { ComponentChildren } from 'preact';
import { useContext, useEffect, useRef } from 'preact/hooks';
import { FocusContext, doesFocusableExist, getCurrentFocusKey, setFocus, useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { onKey } from '../nav/keys';
import { exitApp, LayerContext, layerKey, stack } from '../nav/stack';
import { t } from '../i18n';
import { Button } from './Button';
import { dispatcher } from '../uiClient';

interface DialogProps {
  title: string;
  actions: { label: string; onPress: () => void; focusKey?: string }[];
  /** Back closes the dialog through this. */
  onClose: () => void;
  /** Shown between the title and the actions. */
  children?: ComponentChildren;
  /** Lighter scrim, for dialogs over a backdrop image. */
  clear?: boolean;
  /** Extra class on the dialog, e.g. `menu` for one action per line. */
  cls?: string;
  /** Elementum's own question (UiHost): doesn't count as a modal that makes other questions wait. */
  ui?: boolean;
}

/**
 * Modal: arrows stay inside, Back closes it, and focus returns to where it was.
 * Opened on a hidden lower layer, it takes no keys or focus; it becomes that layer's restore target on pop instead.
 */
export function Dialog({ title, actions, onClose, children, clear, cls, ui }: DialogProps) {
  const layer = useContext(LayerContext);
  const { ref, focusKey, focusSelf } = useFocusable({ isFocusBoundary: true });
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!ui) dispatcher.modal(1);
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
      if (!ui) dispatcher.modal(-1);
      if (stack.isTop(layer)) {
        // A question pushed back by another dialog must not take focus from it.
        if (!(ui && dispatcher.modals() > 0)) {
          // The saved focus may be gone (it was inside a closed dialog): focus the layer instead, as stack.ts does.
          const top = stack.entries[stack.entries.length - 1];
          if (prev && doesFocusableExist(prev)) void setFocus(prev);
          else if (layer || top) void setFocus(layerKey(layer || top.id));
        }
      } else if (entry) {
        entry.focus = prev;
      }
    };
  }, []);

  return (
    <FocusContext.Provider value={focusKey}>
      <div class={clear ? 'dialog-backdrop clear' : 'dialog-backdrop'}>
        <div ref={ref} class={cls ? 'dialog ' + cls : 'dialog'}>
          <h2>{title}</h2>
          {children}
          {actions.map((a, i) => <Button key={i} label={a.label} focusKey={a.focusKey} scroll onPress={a.onPress} />)}
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
