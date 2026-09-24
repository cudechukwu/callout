/** Shared button styles. Primary is the corner-red call to action. */
export const primaryButton =
  "btn-shine cut-sm bg-corner-red px-6 py-3 font-display text-lg font-semibold tracking-[0.08em] text-bone uppercase transition-colors hover:bg-corner-red-bright disabled:opacity-40";

export const secondaryButton =
  "btn-shine cut-sm bg-panel-raised px-6 py-3 font-display text-lg font-semibold tracking-[0.08em] text-bone uppercase transition-colors hover:bg-line disabled:opacity-40";

export function formatClock(seconds: number): string {
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
