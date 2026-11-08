import { useEffect } from 'preact/hooks';
import { reveal } from './reveal';
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';

/** `scroll`: keep the button visible inside its scrolling parent (dialog action lists). */
export function Button({ label, onPress, focusKey, scroll }: { label: string; onPress: () => void; focusKey?: string; scroll?: boolean }) {
  const { ref, focused } = useFocusable({ focusKey, onEnterPress: onPress });
  useEffect(() => {
    if (focused && scroll) reveal(ref.current as HTMLElement);
  }, [focused]);
  return (
    <div ref={ref} class={focused ? 'btn focused' : 'btn'} onClick={onPress}>
      {label}
    </div>
  );
}
