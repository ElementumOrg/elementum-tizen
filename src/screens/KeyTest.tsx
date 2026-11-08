// Settings > Remote key test: shows how the remote's keys arrive (down/up, repeat, timing), to calibrate long press on a real TV.
import { useContext, useEffect, useState } from 'preact/hooks';
import { SpatialNavigation } from '@noriginmedia/norigin-spatial-navigation';
import { t } from '../i18n';
import { onKey } from '../nav/keys';
import { LayerContext, stack } from '../nav/stack';

interface Row {
  type: string;
  code: number;
  key: string;
  repeat: boolean;
  dt: number;
}
const MAX = 15;

export function openKeyTest() {
  stack.push(() => <KeyTest />);
}

function KeyTest() {
  const layer = useContext(LayerContext);
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    SpatialNavigation.pause(); // keys are only read here
    let prev = 0;
    const log = (e: KeyboardEvent) => {
      const now = Date.now();
      const row = { type: e.type, code: e.keyCode, key: e.key || '', repeat: e.repeat, dt: prev ? now - prev : 0 };
      prev = now;
      setRows((r) => [row].concat(r).slice(0, MAX));
    };
    // Capture: runs before the key layer, so Back is logged before it closes the screen.
    window.addEventListener('keydown', log, true);
    window.addEventListener('keyup', log, true);
    const off = onKey((a) => (a === 'back' && stack.pop(), true), { layer });
    return () => {
      window.removeEventListener('keydown', log, true);
      window.removeEventListener('keyup', log, true);
      off();
      SpatialNavigation.resume();
    };
  }, []);
  return (
    <div class="screen keytest">
      <h1>{t('settings.key_test')}</h1>
      <p>{t('settings.key_test_hint')}</p>
      {!rows.length && <p>{t('keytest.empty')}</p>}
      <table>
        {rows.map((r, i) => (
          <tr key={i}>
            <td>{r.type}</td>
            <td>{r.code}</td>
            <td>{r.key}</td>
            <td>{r.repeat ? 'repeat' : ''}</td>
            <td>{r.dt} ms</td>
          </tr>
        ))}
      </table>
    </div>
  );
}
