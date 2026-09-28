import { photoPath } from "@/lib/photo";
import { bibColor, initials } from "@/lib/format";
import type { Runner } from "@/lib/types";

export function Avatar({
  runner,
  eventId,
  size = 48,
  className = "",
}: {
  runner: Pick<Runner, "id" | "name" | "bib" | "photoVer">;
  eventId?: string;
  size?: number;
  className?: string;
}) {
  const src =
    eventId && runner.photoVer ? photoPath(eventId, runner.id, runner.photoVer) : null;
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className={`shrink-0 object-cover ${className}`}
        style={{ width: size, height: size, borderRadius: size > 64 ? 16 : 12 }}
      />
    );
  }
  return (
    <div
      className={`grid shrink-0 place-items-center font-bold text-sand ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: size > 64 ? 16 : 12,
        background: bibColor(runner.bib || runner.name || "?"),
        fontSize: size * 0.32,
      }}
    >
      {initials(runner.name) || runner.bib.slice(0, 2) || "?"}
    </div>
  );
}
