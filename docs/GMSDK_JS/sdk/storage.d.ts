// Types of storage.js (docs/INTEGRATION.md §6). Copy next to it in src/sdk/ when the game uses TypeScript.

export interface GameStorage {
  /** azgames.<gameCode> (azgames.dev without a real code). */
  readonly key: string;
  /** A copy of the area, or `fallback` when it is not saved. */
  get<T>(area: string, fallback: T): T;
  /** Replace an area (undefined removes it). Written within 300 ms, and at once when the tab hides or closes. */
  set(area: string, value: unknown): boolean;
  /** Merge into an area (object). */
  patch(area: string, part: Record<string, unknown>): boolean;
  /** The game's own keys from before the kit, { 'old.key': 'area' }: once, when there is no save yet. */
  migrate(legacy: Record<string, string>): string[];
  /** Write now (after a purchase…). false: not written (storage full or blocked): kept in memory, tried again. */
  flush(): boolean;
  /** A plain copy of the whole save, for debugging. */
  dump(): Record<string, unknown>;
  /** The stored save did not decode (hand edited or broken) and was dropped: the player starts fresh. */
  readonly tampered: boolean;
}

export function storageKey(gameCode: string): string;
export function encodeSave(data: Record<string, unknown>, seed: string): string;
export function decodeSave(text: string, seed: string): Record<string, unknown> | null;
export function createStorage(o?: {
  gameCode?: string;
  /** Reported once each: tampered (save dropped), failed (could not write), large (over 128 K characters). */
  onEvent?: (kind: 'tampered' | 'failed' | 'large', info: Record<string, unknown>) => void;
  delayMs?: number;
  g?: object;
}): GameStorage;
