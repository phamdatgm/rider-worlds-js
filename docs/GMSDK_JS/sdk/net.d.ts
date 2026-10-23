// Types for net.js (docs/INTEGRATION.md §8). Copy next to net.js in a TypeScript game.

export declare const NET: { TRIES: number; TIMEOUT: number; BACKOFF: number[] };
/** Runs fn(try) until it succeeds or NET.TRIES tries have failed; throws the last error. */
export declare function withRetry<T>(fn: (attempt: number) => Promise<T>, label?: string): Promise<T>;
/** A loaded HTMLImageElement (retries, time limit). */
export declare function loadImage(url: string): Promise<HTMLImageElement>;
/** fetch() with a time limit and retries; the Response has been checked for r.ok. */
export declare function fetchRetry(url: string, init?: RequestInit): Promise<Response>;
export declare function loadJSON<T = unknown>(url: string): Promise<T>;
export declare function loadArrayBuffer(url: string): Promise<ArrayBuffer>;
/** Waits for the page's fonts, `ms` at most. */
export declare function fontsReady(ms?: number): Promise<unknown>;
