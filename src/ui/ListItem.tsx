import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { createLongPress } from '../nav/longpress';
import { scrollToAnimated } from './tween';

/** A focusable block in a vertical list (trailers, episodes). Keeps itself near the top of its (positioned) screen when focused. */
export function ListItem({ children, onPress, onFocus, onMenu, cls, focusKey }: { focusKey?: string; children: ComponentChildren; onPress?: () => void; onFocus?: () => void; onMenu?: () => void; cls?: string }) {
  // With a menu, OK acts on release so that a long press doesn't also press.
  const live = useRef({ onPress, onMenu });
  live.current = { onPress, onMenu };
  const press = useRef(createLongPress(() => live.current.onPress && live.current.onPress(), () => live.current.onMenu!())).current;
  const seen = useRef(false); // the first focus (landing on the screen) jumps; later moves animate
  useEffect(() => press.cancel, []);
  const { ref, focused } = useFocusable({
    focusKey,
    onEnterPress: onMenu ? press.press : onPress,
    onEnterRelease: onMenu ? press.release : undefined,
    onBlur: press.cancel,
    onFocus: () => {
      const el = ref.current as HTMLElement;
      const p = el.offsetParent as HTMLElement | null;
      if (p) (scrollToAnimated(p, Math.max(0, el.offsetTop - 160), !seen.current), (seen.current = true)); // leaves room for a fixed title
      if (onFocus) onFocus();
    },
  });
  return (
    <div ref={ref} class={'list-item ' + (cls || '') + (focused ? ' focused' : '')} onClick={onPress}>
      {children}
    </div>
  );
}
