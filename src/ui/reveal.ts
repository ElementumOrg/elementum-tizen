import { scrollToAnimated } from './tween';

// scrollIntoView options aren't supported before Chrome 61 (they act as `true`), so scroll by hand.
/** The scrollTop that makes [top, top+height] visible in a viewport of `client` px, moving as little as possible. */
export function revealTop(scrollTop: number, client: number, top: number, height: number): number {
  if (top < scrollTop) return top;
  if (top + height > scrollTop + client) return top + height - client;
  return scrollTop;
}

/** Scrolls the element's offsetParent (must be positioned) just enough to show it. */
export function reveal(el: HTMLElement) {
  const p = el.offsetParent as HTMLElement | null;
  if (p) scrollToAnimated(p, revealTop(p.scrollTop, p.clientHeight, el.offsetTop, el.offsetHeight));
}
