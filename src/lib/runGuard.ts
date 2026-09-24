/**
 * Tracks whether the player has an unsaved run in progress (picks made or
 * fights fought), so leaving the page can warn first. Everything is
 * in-memory until accounts and saving exist, so leaving loses the fighter
 * and record. The draft page sets this; the top bar and the browser's
 * close/refresh warning read it.
 */
let runActive = false;

export function setRunActive(active: boolean): void {
  runActive = active;
}

export function isRunActive(): boolean {
  return runActive;
}
