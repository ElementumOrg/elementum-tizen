import { useContext, useEffect, useRef, useState } from 'preact/hooks';
import { LayerContext, stack } from '../nav/stack';
import { nextIndex } from './backdrop-util';

/**
 * Full-screen background. With several images and an `interval` (s) it cross-fades to the next one every `interval` s,
 * after preloading it. Two stacked slots swap opacity; the dark gradient stays on top.
 */
export function Backdrop({ images, interval }: { images: string[]; interval?: number }) {
  const key = images.join('|');
  const layer = useContext(LayerContext);
  const [slots, setSlots] = useState<string[]>([images[0] || '', '']);
  const [active, setActive] = useState(0);
  const state = useRef({ idx: 0, active: 0, pending: false });

  useEffect(() => {
    state.current = { idx: 0, active: 0, pending: false };
    setSlots([images[0] || '', '']);
    setActive(0);
    if (images.length < 2 || !interval) return;
    let dead = false;
    const timer = setInterval(() => {
      const s = state.current;
      if (s.pending || !stack.isTop(layer)) return; // only rotate while visible, one load at a time
      s.pending = true;
      const idx = nextIndex(s.idx, images.length);
      const img = new Image();
      img.onload = () => {
        s.pending = false;
        if (dead) return;
        s.idx = idx;
        s.active = 1 - s.active;
        setSlots((p) => (s.active ? [p[0], images[idx]] : [images[idx], p[1]]));
        setTimeout(() => !dead && setActive(s.active), 50); // let the new src mount at opacity 0 first
      };
      img.onerror = () => void ((s.pending = false), (s.idx = idx)); // a broken image is skipped
      img.src = images[idx];
    }, interval * 1000);
    return () => {
      dead = true;
      clearInterval(timer);
    };
  }, [key, interval]);

  return (
    <div class="backdrop">
      {slots.map((u, i) => u && <img key={i} src={u} alt="" style={'opacity:' + (active === i ? 1 : 0)} />)}
      <div class="backdrop-shade" />
    </div>
  );
}
