// Presentation of Elementum's UI host events (see uiClient.ts): the dialog on top of everything, and progress cards.
import { useEffect, useRef, useState } from 'preact/hooks';
import { setFocus, useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { t } from '../i18n';
import { onKey } from '../nav/keys';
import { dispatcher, type UIEvent } from '../uiClient';
import { Dialog } from './Dialog';
import { TextField } from './TextField';

/** Long text: Up/Down scroll it while it can, then focus moves on. */
function TextBody({ text }: { text: string }) {
  const box = useRef<HTMLDivElement>(null);
  const { ref, focused } = useFocusable({
    onArrowPress: (dir) => {
      const el = box.current!;
      const down = dir === 'down' && el.scrollTop < el.scrollHeight - el.clientHeight;
      if (!down && !(dir === 'up' && el.scrollTop > 0)) return true;
      el.scrollTop += down ? 200 : -200;
      return false;
    },
  });
  return (
    <div ref={ref} class={focused ? 'ui-text focused' : 'ui-text'}>
      <div ref={box} class="ui-text-box">{text}</div>
    </div>
  );
}

function Question({ ev, at, error }: { ev: UIEvent; at: number; error: string }) {
  const [picked, setPicked] = useState<number[]>(ev.preselect || []);
  const [text, setText] = useState(typeof ev.default === 'string' ? ev.default : '');
  const [, tick] = useState(0);
  const left = ev.timeout_s ? Math.max(0, Math.ceil(ev.timeout_s - (Date.now() - at) / 1000)) : 0;
  useEffect(() => {
    if (!ev.timeout_s) return;
    const h = setInterval(() => {
      tick((n) => n + 1);
      if (Date.now() - at >= ev.timeout_s! * 1000) dispatcher.expire(ev.id);
    }, 500);
    return () => clearInterval(h);
  }, []);

  // Single select: start on the preselected option (Dialog focuses the first child first, this runs after it).
  useEffect(() => {
    if (ev.kind !== 'select' || ev.multi || !ev.preselect || !ev.preselect.length) return;
    const h = setTimeout(() => setFocus('ui-opt-' + ev.preselect![0]), 0); // after norigin's own focusSelf settles
    return () => clearTimeout(h);
  }, []);
  const answer = (v?: boolean | number[] | string) => void dispatcher.answer(ev, v);
  const cancel = { label: t('common.cancel'), onPress: () => answer() };
  let actions: { label: string; onPress: () => void }[];
  let body: preact.ComponentChildren = ev.message ? <p class="ui-msg">{ev.message}</p> : null;
  if (ev.kind === 'confirm') {
    actions = [{ label: t('common.yes'), onPress: () => answer(true) }, { label: t('common.no'), onPress: () => answer(false) }];
  } else if (ev.kind === 'select') {
    const opts = ev.options || [];
    if (ev.multi) {
      const toggle = (i: number) => setPicked(picked.indexOf(i) < 0 ? picked.concat(i) : picked.filter((x) => x !== i));
      actions = opts.map((o, i) => ({ label: (picked.indexOf(i) < 0 ? '☐ ' : '☑ ') + o, onPress: () => toggle(i) }));
      actions.push({ label: t('common.ok'), onPress: () => picked.length ? answer(picked.slice().sort((a, b) => a - b)) : answer() }, cancel);
    } else {
      actions = opts.map((o, i) => ({ label: o, focusKey: 'ui-opt-' + i, onPress: () => answer([i]) }));
      actions.push(cancel);
    }
  } else if (ev.kind === 'input') {
    body = (
      <>
        <TextField label={ev.message} value={text} onInput={setText} type={ev.hidden ? 'password' : 'text'} onSubmit={answer} />
      </>
    );
    actions = [{ label: t('common.ok'), onPress: () => answer(text) }, cancel];
  } else {
    body = <TextBody text={ev.message} />;
    actions = [{ label: t('common.ok'), onPress: () => answer(true) }];
  }
  return (
    <Dialog title={ev.title || t('ui.title')} onClose={() => (ev.kind === 'text' ? answer(true) : answer())} actions={actions} cls={ev.kind === 'select' ? 'menu' : undefined} ui>
      {body}
      {error && <p class="ui-error">{error}</p>}
      {left > 0 && <p class="ui-countdown">{t('ui.timeout', { s: left })}</p>}
    </Dialog>
  );
}

/** Mount once (App), after the layer stack. */
export function UiHost() {
  const [, rerender] = useState(0);
  useEffect(() => dispatcher.subscribe(() => rerender((n) => n + 1)), []);
  const v = dispatcher.view();
  const first = v.progress[0];
  // Red cancels the oldest progress card; the cards never take focus.
  useEffect(() => {
    if (!first) return;
    return onKey((a) => a === 'red' && (void dispatcher.cancelProgress(first.id), true), { global: true });
  }, [first && first.id]);
  return (
    <>
      {v.progress.length > 0 && (
        <div class="ui-progress-stack">
          {v.progress.map((p, n) => (
            <div key={p.id} class="ui-progress">
              <b>{p.heading}</b>
              <div class="ui-line">{p.line}</div>
              <div class="ui-bar"><i style={`width:${Math.max(0, Math.min(100, p.percent))}%`} /></div>
              <span>{p.percent}%</span>
              {n === 0 && <span class="ui-hint">{t('ui.cancel_hint')}</span>}
            </div>
          ))}
        </div>
      )}
      {v.current && <Question key={v.current.ev.id} ev={v.current.ev} at={v.current.at} error={v.error} />}
    </>
  );
}
