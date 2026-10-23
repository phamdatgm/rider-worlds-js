// Types of leaderboard.js (docs/LEADERBOARD.md). Copy next to it in src/sdk/leaderboard/ when the game uses TypeScript.

/** GMA periods: UTC buckets of the board. */
export type Period = 'daily' | 'weekly' | 'monthly' | 'alltime';

export const PERIODS: readonly Period[];

export interface Player {
  /** GMA player id. */
  id: string;
  /** Display name: 1-20 of A-Z a-z 0-9 _ - (the server's rule). */
  name: string;
  /** ISO 3166 code of the flag (US, VN, GB-ENG); '' = none chosen. */
  country: string;
}

export interface Entry {
  rank: number;
  playerId: string;
  name: string;
  country: string;
  score: number;
}

export interface Page {
  period: Period;
  /** Players on the board for this period. */
  total: number;
  entries: Entry[];
}

/** The part of getSDK() the leaderboard uses. */
export interface LeaderboardSDK {
  track?(name: string, params?: Record<string, unknown>): void;
  storage?: {
    get<T>(area: string, fallback: T): T;
    patch(area: string, part: Record<string, unknown>): boolean;
  };
}

export interface Leaderboard {
  readonly boardId: string;
  /** Signed in and usable. Waits for gmsdkjs the first time (up to waitMs); never rejects. */
  ready(): Promise<boolean>;
  /** The signed-in player; null before ready(). */
  player(): Player | null;
  /** True while the player still has the default name. */
  needsName(): boolean;
  /** Change name and / or flag; true when the server accepted it. */
  setPlayer(p: { name?: string; country?: string }): Promise<boolean>;
  /** Submit a score (signed here); null when it did not reach the board. */
  submit(score: number, metadata?: unknown): Promise<{ rank: number; score: number } | null>;
  /** One page of the ranking; null = could not load (not an empty board). */
  top(period?: Period, opts?: { offset?: number; limit?: number }): Promise<Page | null>;
  /** The player's entry; null = no score this period; undefined = could not load. */
  me(period?: Period): Promise<Entry | null | undefined>;
}

export function createLeaderboard(o: {
  sdk: LeaderboardSDK;
  /** game.json leaderboardId. */
  boardId: string;
  /** Default 20000. */
  waitMs?: number;
  g?: typeof globalThis;
}): Leaderboard;

export function cleanName(name: unknown): string;
export function cleanCountry(code: unknown): string;
export function scoreToken(playerId: string, score: number, now?: number): string;
