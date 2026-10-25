"use client";

/**
 * Draggable lane perspective guides for Finish Cam record preview + Analyse overlay.
 * Geometry / persistence / point→lane: `@/lib/client/lane-guides`.
 *
 * Agent 1: mount `<LaneGuidesOverlay … />` over the scrubber video (same relative box).
 * Agent 3: use `loadLaneGuides` + `mapFeetToLane` / `feetPointFromBox` — do not re-split 1/N.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyPreset,
  createLaneGuides,
  guideAxis,
  loadLaneGuides,
  moveBoundary,
  saveLaneGuides,
  type LaneGuidePreset,
  type LaneGuides,
} from "@/lib/client/lane-guides";

export type LaneGuidesOverlayProps = {
  eventCode: string;
  laneCount: number;
  /** When false, bands are visible but not interactive (e.g. during snapshot). */
  interactive?: boolean;
  /** Show side-on / head-on chips (default false — sprint Finish Cam is side-on only). */
  showPresetToggle?: boolean;
  className?: string;
  /** Notify parent when guides change (optional; storage is already written). */
  onChange?: (guides: LaneGuides) => void;
};

export function useLaneGuides(
  eventCode: string,
  laneCount: number,
): [LaneGuides, (next: LaneGuides) => void] {
  const n = Math.max(1, laneCount);
  const [guides, setGuidesState] = useState<LaneGuides>(() =>
    createLaneGuides(n, "side-on"),
  );

  useEffect(() => {
    const loaded = loadLaneGuides(eventCode, n);
    // Sprint Finish Cam is side-on only — migrate any saved head-on.
    setGuidesState(
      loaded.preset === "side-on" ? loaded : applyPreset(loaded, "side-on"),
    );
  }, [eventCode, n]);

  const setGuides = useCallback(
    (next: LaneGuides) => {
      setGuidesState(next);
      saveLaneGuides(eventCode, next);
    },
    [eventCode],
  );

  return [guides, setGuides];
}

/**
 * Full-bleed overlay: N translucent bands + draggable boundary handles
 * across the red finishing line. Parent must be `position: relative` and
 * match the video frame box.
 */
export function LaneGuidesOverlay({
  eventCode,
  laneCount,
  interactive = true,
  showPresetToggle = false,
  className = "",
  onChange,
}: LaneGuidesOverlayProps) {
  const [guides, setGuides] = useLaneGuides(eventCode, laneCount);
  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ index: number } | null>(null);
  const guidesRef = useRef(guides);
  guidesRef.current = guides;

  const commit = useCallback(
    (next: LaneGuides) => {
      setGuides(next);
      onChange?.(next);
    },
    [onChange, setGuides],
  );

  const onPreset = useCallback(
    (preset: LaneGuidePreset) => {
      if (preset === guidesRef.current.preset) return;
      commit(applyPreset(guidesRef.current, preset));
    },
    [commit],
  );

  const clientToNorm = useCallback((clientX: number, clientY: number): number | null => {
    const el = rootRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return null;
    if (guideAxis(guidesRef.current.preset) === "y") {
      return Math.min(1, Math.max(0, (clientY - r.top) / r.height));
    }
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width));
  }, []);

  useEffect(() => {
    if (!interactive) return;

    function onMove(e: PointerEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      const v = clientToNorm(e.clientX, e.clientY);
      if (v == null) return;
      commit(moveBoundary(guidesRef.current, drag.index, v));
    }

    function onUp() {
      dragRef.current = null;
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [clientToNorm, commit, interactive]);

  const axis = guideAxis(guides.preset);
  const n = guides.laneCount;

  return (
    <div
      ref={rootRef}
      className={`pointer-events-none absolute inset-0 z-[1] ${className}`}
      aria-label="Lane guides"
    >
      {/* Band fills */}
      {Array.from({ length: n }, (_, i) => {
        const lane = i + 1;
        const a = guides.boundaries[i]!;
        const b = guides.boundaries[i + 1]!;
        const style =
          axis === "y"
            ? { top: `${a * 100}%`, height: `${(b - a) * 100}%`, left: 0, right: 0 }
            : { left: `${a * 100}%`, width: `${(b - a) * 100}%`, top: 0, bottom: 0 };
        const tint = i % 2 === 0 ? "bg-sand/[0.06]" : "bg-accent/[0.07]";
        return (
          <div key={lane} className={`absolute ${tint}`} style={style}>
            <span
              className={`pointer-events-none absolute font-mono text-[10px] font-black tabular text-sand/80 ${
                axis === "y" ? "top-1 left-2" : "top-2 left-1"
              }`}
            >
              L{lane}
            </span>
          </div>
        );
      })}

      {/* Boundary handles */}
      {interactive
        ? Array.from({ length: n - 1 }, (_, i) => {
            const index = i + 1;
            const t = guides.boundaries[index]!;
            const style =
              axis === "y"
                ? {
                    top: `${t * 100}%`,
                    left: 0,
                    right: 0,
                    height: 20,
                    marginTop: -10,
                    cursor: "ns-resize" as const,
                  }
                : {
                    left: `${t * 100}%`,
                    top: 0,
                    bottom: 0,
                    width: 20,
                    marginLeft: -10,
                    cursor: "ew-resize" as const,
                  };
            return (
              <div
                key={`h-${index}`}
                role="slider"
                aria-label={`Lane boundary ${index}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(t * 100)}
                className="pointer-events-auto absolute z-[3] touch-none"
                style={style}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                  dragRef.current = { index };
                }}
              >
                <div
                  className={
                    axis === "y"
                      ? "absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-sand/70 shadow-[0_0_0_1px_rgba(0,0,0,0.45)]"
                      : "absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-sand/70 shadow-[0_0_0_1px_rgba(0,0,0,0.45)]"
                  }
                />
                <div
                  className={
                    axis === "y"
                      ? "absolute top-1/2 left-1/2 h-3 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full bg-panel2 ring-1 ring-line"
                      : "absolute top-1/2 left-1/2 h-8 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-panel2 ring-1 ring-line"
                  }
                />
              </div>
            );
          })
        : null}

      {showPresetToggle ? (
        <div
          className="pointer-events-auto absolute right-0 bottom-2 z-[5] flex flex-row gap-1"
          aria-label="Lane guide preset"
        >
          <PresetChip
            label="Side-on"
            active={guides.preset === "side-on"}
            onClick={() => onPreset("side-on")}
            dock="right"
          />
          <PresetChip
            label="Head-on"
            active={guides.preset === "head-on"}
            onClick={() => onPreset("head-on")}
            dock="right"
          />
        </div>
      ) : null}
    </div>
  );
}

function PresetChip({
  label,
  active,
  onClick,
  dock = "none",
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  /** Kept for API; horizontal group is positioned with right-0 on the parent. */
  dock?: "none" | "right";
}) {
  void dock;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`tap rounded-lg px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider ring-1 ${
        active
          ? "bg-sand text-ink ring-sand"
          : "bg-black/70 text-sand ring-line active:bg-panel2"
      }`}
    >
      {label}
    </button>
  );
}
