// Types of copyright.js (docs/LOADING.md §2).

export const COPYRIGHT_YEAR: number;
export const COPYRIGHT_OWNER: string;
/** "© 2026 Azgames.io" */
export const COPYRIGHT_DEFAULT: string;

/** The copyright line: the default unless the server says otherwise; '' = show nothing. */
export function copyrightText(sdk?: { version?: string; brand?: { trademark(): string } }): string;
