/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

// Only the Tizen web APIs we call; `tizen` is undefined in a desktop browser, so guard with `typeof`.
declare const tizen: {
  tvinputdevice: { registerKey(name: string): void };
  application: { getCurrentApplication(): { exit(): void } };
  systeminfo: {
    getPropertyValue(prop: 'LOCALE', ok: (locale: { language: string }) => void, err?: (e: unknown) => void): void;
  };
};
