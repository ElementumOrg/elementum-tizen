import { useRef } from 'preact/hooks';
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';

// Enter (13) and the Tizen IME's Done (65376) / Cancel (65385), Back (10009) and Escape leave the input.
const LEAVE_KEYS = [13, 65376, 65385, 10009, 27];

interface TextFieldProps {
  label: string;
  value: string;
  onInput: (value: string) => void;
  type?: 'text' | 'number' | 'password';
  focusKey?: string;
  /** Enter or the IME's Done (not Cancel/Back), with the final text. */
  onSubmit?: (value: string) => void;
}

/**
 * A native input the remote can reach: arrows move to it like any focusable, Enter puts the DOM focus in the
 * input (which opens the Tizen IME). While typing, keys stay in the input, away from spatial navigation and Back.
 */
export function TextField({ label, value, onInput, type = 'text', focusKey, onSubmit }: TextFieldProps) {
  const input = useRef<HTMLInputElement>(null);
  const { ref, focused } = useFocusable({ focusKey, onEnterPress: () => input.current!.focus() });
  const onKeyDown = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (LEAVE_KEYS.indexOf(e.keyCode) >= 0) {
      e.preventDefault();
      if (onSubmit && (e.keyCode === 13 || e.keyCode === 65376)) onSubmit(input.current!.value);
      input.current!.blur();
    }
  };
  return (
    <div ref={ref} class={focused ? 'field focused' : 'field'}>
      <span>{label}</span>
      <input ref={input} type={type} value={value} onKeyDown={onKeyDown}
        onInput={(e) => onInput((e.currentTarget as HTMLInputElement).value)} />
    </div>
  );
}
