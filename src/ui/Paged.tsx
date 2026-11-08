// Paged Row/Grid with loading, empty and error states, plus a picker dialog for loaded options (genres, lists).
import { useEffect, useState } from 'preact/hooks';
import { ApiError, errorText, type Request } from '../api/client';
import type { components } from '../api/schema';
import { t } from '../i18n';
import { openDetails } from '../screens/Details';
import { Dialog } from './Dialog';
import { ErrorView } from './ErrorView';
import { Grid } from './Grid';
import { Row } from './Row';
import { Spinner } from './Spinner';
import { usePaged, type FetchPage } from './pager';

export type MediaItem = components['schemas']['MediaItem'];

/** Page size for every list. */
export const LIMIT = 20;

const trackerOff = (e: unknown) =>
  e instanceof ApiError && (e.code === 'tracker_not_authorized' || e.code === 'tracker_unsupported');

/** errorText, plus the tracker states the screens explain. */
export function errorMessage(e: unknown) {
  if (!trackerOff(e)) return errorText(e);
  return t((e as ApiError).code === 'tracker_not_authorized' ? 'tracker.not_linked' : 'tracker.unsupported');
}

/** A grid screen body. Give it a new `key` when its list changes. */
export function PagedGrid({ fetchPage, empty, onSelect = openDetails }: { fetchPage: FetchPage<MediaItem>; empty?: string; onSelect?: (item: MediaItem) => void }) {
  const p = usePaged(fetchPage);
  if (p.items.length) return <Grid items={p.items} onSelect={onSelect} onEndReached={p.more} />;
  if (p.error) return <ErrorView message={errorMessage(p.error)} onRetry={p.more} />;
  if (p.loading) return <Spinner />;
  return <p class="empty">{empty || t('browse.empty')}</p>;
}

/** A titled row; hidden when empty or when the tracker isn't linked (409). */
export function PagedRow({ title, fetchPage }: { title: string; fetchPage: FetchPage<MediaItem> }) {
  const p = usePaged(fetchPage);
  if (p.items.length) return <Row title={title} items={p.items} onSelect={openDetails} onEndReached={p.more} />;
  if ((p.error && trackerOff(p.error)) || (!p.error && !p.loading)) return null;
  return (
    <div class="row">
      <h2>{title}</h2>
      <div class="row-viewport">{p.error ? <ErrorView message={errorMessage(p.error)} onRetry={p.more} /> : <Spinner />}</div>
    </div>
  );
}

interface PickerProps<O> {
  title: string;
  load: () => Request<O[]>;
  onPick: (option: O) => void;
  onClose: () => void;
}

/** Loads the options, then shows them as a dialog (nothing while loading; an error or "none" dialog otherwise). */
export function Picker<O extends { name: string }>({ title, load, onPick, onClose }: PickerProps<O>) {
  const [options, setOptions] = useState<O[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    const req = load();
    req.then(setOptions, (e) => e.code !== 'aborted' && setError(e));
    return req.abort;
  }, []);
  if (!options && !error) return null;
  const ok = [{ label: t('common.ok'), onPress: onClose }];
  if (error) return <Dialog title={errorMessage(error)} onClose={onClose} actions={ok} />;
  if (!options!.length) return <Dialog title={t('browse.empty')} onClose={onClose} actions={ok} />;
  return (
    <Dialog title={title} onClose={onClose}
      actions={options!.map((o) => ({ label: o.name, onPress: () => (onClose(), onPick(o)) }))} />
  );
}

/** A switcher button; the active one is ticked, like the language list in Settings. */
export const tick = (label: string, active: boolean) => (active ? '✓ ' : '') + label;
