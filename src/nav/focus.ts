import { useContext, useEffect, useState } from 'preact/hooks';
import { SpatialNavigation, getCurrentFocusKey } from '@noriginmedia/norigin-spatial-navigation';
import { LayerContext, stack } from './stack';

/**
 * On mount, take the focus if it rests on an ancestor container. That happens when the content
 * this component replaced (a Spinner, an ErrorView) had nothing focusable left, so arrows would go nowhere.
 * Hidden lower layers never take it.
 */
export function useClaimFocus(focusKey: string, focusSelf: () => void) {
  const layer = useContext(LayerContext);
  useEffect(() => {
    if (stack.isTop(layer) && SpatialNavigation.isDescendantOf(focusKey, getCurrentFocusKey())) focusSelf();
  }, []);
}

/** True while this screen's layer is the top one (a pushed screen hides it but keeps it mounted). */
export function useOnTop() {
  const layer = useContext(LayerContext);
  const [top, setTop] = useState(stack.isTop(layer));
  useEffect(() => {
    const update = () => setTop(stack.isTop(layer));
    update();
    return stack.subscribe(update);
  }, []);
  return top;
}
