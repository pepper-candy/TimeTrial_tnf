import { photoPath } from "@/lib/photo";
import { bibColor, initials } from "@/lib/format";
import type { Runner } from "@/lib/types";

export function Avatar({
  runner,
  eventId,
  size = 48,
  className = "",
  overlay = true,
}: {
  runner: Pick<Runner, "id" | "name" | "bib" | "photoVer">;
  eventId?: string;
  size?: number;
  className?: string;
  overlay?: boolean;
}) {
  const src =
    eventId && runner.photoVer ? photoPath(eventId, runner.id, runner.photoVer) : null;
  const radius = size > 64 ? 16 : 12;
  const bib = runner.bib || "";
  return (
    <div
      className={`relative shrink-0 overflow-hidden ring-1 ring-black/50 ${className}`}
      style={{ width: size, height: size, borderRadius: radius }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" width={size} height={size} className="h-full w-full object-cover" />
      ) : (
        <div
          className="grid h-full w-full place-items-center font-black tabular text-sand"
          style={{
            background: bibColor(bib || runner.name || "?"),
            fontSize: size * 0.32,
          }}
        >
          {initials(runner.name) || bib.slice(0, 2) || "?"}
        </div>
      )}
      {overlay && bib ? (
        <span
          className="absolute inset-x-0 bottom-0 bg-black/75 text-center font-mono font-black leading-none tabular text-gold"
          style={{ fontSize: Math.max(9, size * 0.22), padding: size > 56 ? "3px 0 4px" : "2px 0 3px" }}
        >
          {bib}
        </span>
      ) : null}
    </div>
  );
}
