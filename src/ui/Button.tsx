import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';

export function Button({ label, onPress, focusKey }: { label: string; onPress: () => void; focusKey?: string }) {
  const { ref, focused } = useFocusable({ focusKey, onEnterPress: onPress });
  return (
    <div ref={ref} class={focused ? 'btn focused' : 'btn'} onClick={onPress}>
      {label}
    </div>
  );
}
