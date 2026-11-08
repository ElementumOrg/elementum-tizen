const DURATION_MS = 220;
const rafs = new WeakMap<HTMLElement, number>(); // per element, so a dialog's reveal can't cancel the screen's tween

/** Pure easing, 0..1 → 0..1 (ease-out cubic). */
export function easeOut(t: number): number {
  const u = 1 - t;
  return 1 - u * u * u;
}

/** Animates `el.scrollTop` to `target` (~220 ms, ease-out). A newer call cancels the running one; `instant` jumps. */
export function scrollToAnimated(el: HTMLElement, target: number, instant = false) {
  cancelAnimationFrame(rafs.get(el) || 0);
  const from = el.scrollTop;
  if (instant || from === target) {
    el.scrollTop = target;
    return;
  }
  const t0 = Date.now();
  const step = () => {
    const k = Math.min(1, (Date.now() - t0) / DURATION_MS);
    el.scrollTop = from + (target - from) * easeOut(k);
    if (k < 1) rafs.set(el, requestAnimationFrame(step));
  };
  rafs.set(el, requestAnimationFrame(step));
}

/** The nearest ancestor that can scroll vertically (overflow hidden counts: we drive it by hand). */
export function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) if (p.scrollHeight > p.clientHeight && p !== document.body) return p;
  return null;
}

/** Animated replacement for `el.scrollIntoView(true)`: align el's top with its scroll parent's top. */
export function scrollTopTo(el: HTMLElement, instant = false) {
  const p = scrollParent(el);
  if (p) scrollToAnimated(p, Math.max(0, p.scrollTop + el.getBoundingClientRect().top - p.getBoundingClientRect().top), instant);
}
