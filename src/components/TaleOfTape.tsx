import { VISIBLE_ATTRIBUTES } from "@/lib/data/types";
import { ATTRIBUTE_LABELS } from "@/lib/data/attributeLabels";
import { SHOW_ATTRIBUTE_NUMBERS } from "@/lib/config";
import { ratingToDisplay } from "@/lib/ratings";
import type { AttributeSelections } from "@/lib/simulation/types";
import { Avatar } from "@/components/Avatar";

interface Side {
  name: string;
  overall: number;
  selections: AttributeSelections;
  record?: { wins: number; losses: number };
  /** Line under the name; defaults to "CPU" / the record / "Your fighter". */
  tag?: string;
}

interface TaleOfTapeProps {
  player: Side;
  cpu: Side;
}

function Header({ side, corner }: { side: Side; corner: "red" | "white" }) {
  const isRed = corner === "red";
  return (
    <div className={`relative flex flex-col ${isRed ? "items-start" : "items-end"}`}>
      <Avatar
        name={side.name}
        corner={corner}
        className={`aspect-[4/5] w-full max-w-[11rem] ${isRed ? "cut-left" : "cut-right"} sm:max-w-[12.5rem]`}
      />
      <div className={`mt-3 ${isRed ? "text-left" : "text-right"}`}>
        <p className="font-display text-xl leading-tight font-semibold tracking-[0.06em] text-bone uppercase sm:text-3xl">
          {side.name}
        </p>
        <p className="mt-1 text-sm text-chalk">
          {side.tag ??
            (corner === "white" ? "CPU" : side.record ? `${side.record.wins}–${side.record.losses}` : "Your fighter")}
        </p>
        <p className="mt-2 font-display text-5xl leading-[0.8] font-bold text-belt-gold sm:text-6xl">
          <span className="font-numeric">{side.overall}</span>
          <span className="ml-2 text-lg font-bold text-chalk">OVR</span>
        </p>
      </div>
    </div>
  );
}

/**
 * Head to head, broadcast style: red corner (you) on the left, white
 * corner (CPU) on the right, every attribute meeting in the middle.
 * The higher number in each row is brighter.
 */
export function TaleOfTape({ player, cpu }: TaleOfTapeProps) {
  return (
    <section aria-label="Tale of the tape" className="cut bg-panel px-4 py-6 sm:px-8 sm:py-8">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-6">
        <Header side={player} corner="red" />
        <p className="font-display text-3xl font-semibold tracking-[0.12em] text-belt-gold sm:text-4xl">VS</p>
        <Header side={cpu} corner="white" />
      </div>

      <div className="mt-8 border-t border-line pt-4">
        {VISIBLE_ATTRIBUTES.map((attribute, index) => {
          const left = ratingToDisplay(player.selections[attribute].sourceFighter[attribute]);
          const right = ratingToDisplay(cpu.selections[attribute].sourceFighter[attribute]);
          const delay = 300 + index * 90;
          return (
            <div
              key={attribute}
              className="grid grid-cols-[1fr_5.5rem_1fr] items-center gap-2 py-2 sm:grid-cols-[1fr_8rem_1fr] sm:gap-4"
            >
              <div className="flex items-center justify-end gap-2">
                {SHOW_ATTRIBUTE_NUMBERS ? (
                  <span
                    className={`font-numeric text-xl leading-none font-bold ${left >= right ? "text-bone" : "text-chalk-faint"}`}
                  >
                    {left}
                  </span>
                ) : (
                  <span className="sr-only">{`${left} out of 99`}</span>
                )}
                <div className="h-2 w-full max-w-[14rem] overflow-hidden bg-line" aria-hidden="true">
                  <div
                    className={`animate-bar-fill-right ml-auto h-full w-full bg-corner-red ${left < right ? "opacity-45" : ""}`}
                    style={{ "--fill": left / 100, animationDelay: `${delay}ms` } as React.CSSProperties}
                  />
                </div>
              </div>
              <p className="text-center text-xs leading-tight font-medium text-chalk sm:text-sm">
                {ATTRIBUTE_LABELS[attribute]}
              </p>
              <div className="flex items-center gap-2">
                <div className="h-2 w-full max-w-[14rem] overflow-hidden bg-line" aria-hidden="true">
                  <div
                    className={`animate-bar-fill h-full w-full bg-corner-white ${right < left ? "opacity-45" : ""}`}
                    style={{ "--fill": right / 100, animationDelay: `${delay}ms` } as React.CSSProperties}
                  />
                </div>
                {SHOW_ATTRIBUTE_NUMBERS ? (
                  <span
                    className={`font-numeric text-xl leading-none font-bold ${right >= left ? "text-bone" : "text-chalk-faint"}`}
                  >
                    {right}
                  </span>
                ) : (
                  <span className="sr-only">{`${right} out of 99`}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
