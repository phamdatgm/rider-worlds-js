// Types of loading.js and loader.js (docs/LOADING.md). Copy next to loading.js in src/sdk/loading/ when the game uses
// TypeScript.

export interface Loader {
  /** 0..1 of the game's own loading: the bar goes from 30 % to 100 %, "Almost there..." from 99 %. */
  progress(fraction: number): void;
  /** The game's name, once game.json is loaded. */
  setTitle(name: string): void;
  /** Load failed: the message (default "Connection problem…") and a Reload button. */
  error(text?: string): void;
  /** The first screen of the game is on: hides the screen and calls sdk.loadingDone(). */
  hide(): void;
}

export function createLoader(): Loader;

/** window.GMLoader, set by loader.js before anything else runs. */
export interface GmLoader {
  /** window.GMSDKJS once gmsdkjs.js has loaded (null: dev page without it). Never settles when loading failed. */
  ready(): Promise<object | null>;
  progress(fraction: number): void;
  setTitle(name: string): void;
  done(): void;
  fail(text?: string): void;
  readonly state: { sdk: 'loading' | 'ok' | 'failed'; game: 'loading' | 'ok' | 'failed' };
}

declare global {
  interface Window {
    GMLoader?: GmLoader;
  }
}
