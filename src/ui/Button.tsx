import { useEffect } from 'preact/hooks';
import { hover } from '../nav/focus';
import { onClickNotEnter, onFreshEnter } from '../nav/keys';
import { reveal } from './reveal';
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';

/** `scroll`: keep the button visible inside its scrolling parent (dialog action lists). */
export function Button({ label, onPress, focusKey, scroll }: { label: string; onPress: () => void; focusKey?: string; scroll?: boolean }) {
  const { ref, focused, focusSelf } = useFocusable({ focusKey, onEnterPress: onFreshEnter(onPress) });
  useEffect(() => {
    if (focused && scroll) reveal(ref.current as HTMLElement);
  }, [focused]);
  return (
    <div ref={ref} class={focused ? 'btn focused' : 'btn'} onClick={onClickNotEnter(onPress)} onMouseMove={hover(focused, focusSelf)}>
      {label}
    </div>
  );
}
