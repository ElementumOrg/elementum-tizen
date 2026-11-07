import en from './en.json';

// shortcut: English only, no vars; B3 replaces this module with real i18n (same `t` signature).
export function t(key: string): string {
  return (en as Record<string, string>)[key] || key;
}
