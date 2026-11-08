import { t } from '../i18n';
import { stack } from '../nav/stack';
import { Button } from '../ui/Button';

export type StreamTarget =
  | { type: 'movie'; tmdb_id: number; title: string }
  | { type: 'episode'; tmdb_id: number; season: number; episode: number; title: string };

/** Placeholder; B8 replaces it with the real streams list. */
export function openStreams(target: StreamTarget) {
  stack.push(() => (
    <div class="screen">
      <h1>{target.title}</h1>
      <p style="margin-left:24px">{t('streams.coming_soon')}</p>
      <div style="margin-left:24px">
        <Button label={t('common.back')} onPress={() => stack.pop()} />
      </div>
    </div>
  ));
}
