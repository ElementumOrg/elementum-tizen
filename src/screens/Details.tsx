// Placeholder until B7 replaces this file; keep the openDetails signature.
import { stack } from '../nav/stack';

export function openDetails(item: { type: 'movie' | 'show'; tmdb_id: number; title: string }) {
  stack.push(() => (
    <div class="screen">
      <h1>{item.title}</h1>
    </div>
  ));
}
