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

// Samsung AVPlay (webapis.js, loaded only on Tizen); only what src/player/avplay.ts calls.
interface AVPlayTrack {
  index: number;
  type: 'AUDIO' | 'TEXT' | 'VIDEO';
  extra_info: string; // JSON string, e.g. {"language":"eng"}
}
interface AVPlayAPI {
  open(url: string): void;
  close(): void;
  stop(): void;
  play(): void;
  pause(): void;
  suspend(): void;
  restore(): void;
  prepareAsync(ok: () => void, err: (e: unknown) => void): void;
  setDisplayRect(x: number, y: number, w: number, h: number): void;
  setListener(l: {
    onbufferingstart?: () => void;
    onbufferingprogress?: (percent: number) => void;
    onbufferingcomplete?: () => void;
    onstreamcompleted?: () => void;
    onerror?: (e: unknown) => void;
    onevent?: (type: string, data: string) => void;
    onsubtitlechange?: (duration: number, text: string, type: number, attrCount: number, attrs: unknown) => void;
  }): void;
  seekTo(ms: number, ok?: () => void, err?: (e: unknown) => void): void;
  getCurrentTime(): number;
  getDuration(): number;
  getTotalTrackInfo(): AVPlayTrack[];
  getCurrentStreamInfo(): AVPlayTrack[];
  setSelectTrack(type: 'AUDIO' | 'TEXT', index: number): void;
  setSilentSubtitle(silent: boolean): void;
}
interface Window {
  webapis?: { avplay?: AVPlayAPI };
}
