import { useContext, useEffect } from 'preact/hooks';
import { LayerContext, stack } from '../nav/stack';
import { onKey } from '../nav/keys';
import { t } from '../i18n';
import { del } from '../api/client';
import { Button } from '../ui/Button';

export interface PlayerSession {
  id: string;
  stream_url: string;
  resume_s: number | null;
  title: string;
}

/** Placeholder; B9 replaces it. Replaces the buffering screen on top of the stack (depth cap), so call it only from there. */
export function openPlayer(session: PlayerSession) {
  stack.replace(() => <PlayerScreen session={session} />);
}

function PlayerScreen({ session }: { session: PlayerSession }) {
  const layer = useContext(LayerContext);
  const back = () => {
    del('/playback/{id}', { path: { id: session.id }, quiet: true }).catch(() => {});
    stack.pop();
  };
  useEffect(() => onKey((a) => a === 'back' && (back(), true), { layer }), []); // Back stops the session first
  return (
    <div class="screen player">
      <h1>{session.title}</h1>
      <video src={session.stream_url} controls autoplay width={960} height={540} />
      <div style="margin-left:24px">
        <Button label={t('common.back')} onPress={back} />
      </div>
    </div>
  );
}
