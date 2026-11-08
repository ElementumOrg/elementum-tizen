// Trailing-edge debounce: the latest call wins. `cancel` drops the pending call.
export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  return {
    call(...a: A) {
      cancel();
      timer = setTimeout(() => ((timer = undefined), fn(...a)), ms);
    },
    cancel,
  };
}
