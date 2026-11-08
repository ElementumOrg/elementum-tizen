import { t } from './i18n';
// The tracker Elementum is set to use, from /system/info (saved by Boot). Charts work without login, hence the Trakt fallback.
let info: { name?: string; authorized?: boolean } | null = null;

export const setTracker = (tracker: { name: string; authorized: boolean } | null) => void (info = tracker);
/** Provider name, or null when none is selected (charts then fall back to Trakt, which needs no login). */
export const trackerName = () => (info && info.name) || t('tracker.generic');
/** True when /system/info says an account is linked, so tracker-backed actions (watched) can work. */
export const trackerLinked = () => !!(info && info.authorized);
