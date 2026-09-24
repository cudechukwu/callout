/** Shared button styles. Primary is the corner-red call to action. */
export const primaryButton =
  "cut-sm bg-corner-red px-8 py-4 font-display text-xl font-extrabold tracking-wide text-bone uppercase transition-colors hover:bg-corner-red-bright disabled:opacity-40";

export const secondaryButton =
  "cut-sm bg-panel-raised px-8 py-4 font-display text-xl font-bold tracking-wide text-bone uppercase transition-colors hover:bg-line disabled:opacity-40";

export function formatClock(seconds: number): string {
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
