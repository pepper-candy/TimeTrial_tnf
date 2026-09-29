"use client";

import { useState } from "react";
import { PhotoLightbox } from "@/components/photo-lightbox";
import { photoPath } from "@/lib/photo";
import { bibColor, initials } from "@/lib/format";
import type { Runner } from "@/lib/types";

export function Avatar({
  runner,
  eventId,
  size = 48,
  className = "",
  overlay = true,
  lightbox = false,
}: {
  runner: Pick<Runner, "id" | "name" | "bib" | "photoVer">;
  eventId?: string;
  size?: number;
  className?: string;
  overlay?: boolean;
  lightbox?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const src =
    eventId && runner.photoVer ? photoPath(eventId, runner.id, runner.photoVer, "thumb") : null;
  const full =
    eventId && runner.photoVer ? photoPath(eventId, runner.id, runner.photoVer, "full") : null;
  const radius = size > 64 ? 16 : 12;
  const bib = runner.bib || "";
  const canOpen = Boolean(lightbox && full);
  return (
    <>
      <div
        className={`relative shrink-0 overflow-hidden ring-1 ring-black/50 ${
          canOpen ? "tap cursor-zoom-in" : ""
        } ${className}`}
        style={{ width: size, height: size, borderRadius: radius }}
        onPointerDown={
          canOpen
            ? (e) => {
                e.stopPropagation();
              }
            : undefined
        }
        onPointerUp={
          canOpen
            ? (e) => {
                e.stopPropagation();
              }
            : undefined
        }
        onClick={
          canOpen
            ? (e) => {
                e.preventDefault();
                e.stopPropagation();
                setOpen(true);
              }
            : undefined
        }
        role={canOpen ? "button" : undefined}
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
      {open && full ? (
        <PhotoLightbox src={full} alt={runner.name || runner.bib} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}
