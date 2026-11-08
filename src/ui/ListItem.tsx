import type { ComponentChildren } from 'preact';
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';

/** A focusable block in a vertical list (trailers, episodes). Keeps itself near the top of its (positioned) screen when focused. */
export function ListItem({ children, onPress, onFocus, cls }: { children: ComponentChildren; onPress?: () => void; onFocus?: () => void; cls?: string }) {
  const { ref, focused } = useFocusable({
    onEnterPress: onPress,
    onFocus: () => {
      const el = ref.current as HTMLElement;
      const p = el.offsetParent as HTMLElement | null;
      if (p) p.scrollTop = Math.max(0, el.offsetTop - 160); // leaves room for a fixed title
      if (onFocus) onFocus();
    },
  });
  return (
    <div ref={ref} class={'list-item ' + (cls || '') + (focused ? ' focused' : '')} onClick={onPress}>
      {children}
    </div>
  );
}
