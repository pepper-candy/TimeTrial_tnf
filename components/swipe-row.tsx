"use client";

import {
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type TransitionEvent,
} from "react";
import { TrashIcon } from "@/components/trash-icon";
import { decideSwipe, horizontalIntent } from "@/lib/swipe";

const SLIDE_MS = 160;
const SPRING_MS = 220;

type Drag = {
  id: number;
  x: number;
  y: number;
  t: number;
  locked: boolean;
};

/**
 * A list row that deletes from a full-height zone on the right, or by dragging left.
 * The row box stays put; only the face slides, so neighbours do not reflow.
 */
export function SwipeRow({
  children,
  onDelete,
  label,
  disabled,
  className = "",
}: {
  children: ReactNode;
  onDelete: () => void;
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const exitingRef = useRef(false);
  const xRef = useRef(0);
  const rafRef = useRef(0);
  const timerRef = useRef(0);
  const [x, setX] = useState(0);
  const [anim, setAnim] = useState<"none" | "spring" | "out">("none");

  function setOffset(next: number) {
    xRef.current = next;
    setX(next);
  }

  function reducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function fireDelete() {
    if (!exitingRef.current) return;
    exitingRef.current = false;
    window.clearTimeout(timerRef.current);
    onDelete();
  }

  function slideTo(next: number, kind: "spring" | "out") {
    setAnim(kind);
    window.cancelAnimationFrame(rafRef.current);
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = 0;
      setOffset(next);
    });
  }

  if (disabled) {
    return <div className={className}>{children}</div>;
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (exitingRef.current || e.button !== 0) return;
    const target = e.target as HTMLElement;
    const zone = target.closest("[data-swipe-delete]");
    const interactive = target.closest("input, textarea, select, button, a, [data-no-swipe]");
    if (interactive && !zone) return;
    window.cancelAnimationFrame(rafRef.current);
    drag.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      t: e.timeStamp,
      locked: false,
    };
    setAnim("none");
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId || exitingRef.current) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.locked) {
      if (horizontalIntent(dx, dy)) {
        d.locked = true;
        try {
          root.current?.setPointerCapture(e.pointerId);
        } catch {
          /* A synthetic pointer, or one the browser already released. */
        }
      } else if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
        drag.current = null;
        return;
      } else {
        return;
      }
    }
    e.preventDefault();
    setOffset(Math.min(0, dx));
  }

  function finish(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!d.locked) return;
    suppressClick.current = true;
    const dx = e.clientX - d.x;
    const dt = Math.max(1, e.timeStamp - d.t);
    const velocity = dx / dt;
    const width = root.current?.offsetWidth ?? 0;
    if (decideSwipe({ dx, width, velocity }) === "commit") {
      exitingRef.current = true;
      if (reducedMotion() || xRef.current <= -width + 1) {
        fireDelete();
        return;
      }
      slideTo(-width, "out");
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(fireDelete, SLIDE_MS + 50);
      return;
    }
    if (reducedMotion()) {
      setAnim("none");
      setOffset(0);
      return;
    }
    slideTo(0, "spring");
  }

  function onTransitionEnd(e: TransitionEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget || e.propertyName !== "transform") return;
    if (anim !== "out") return;
    fireDelete();
  }

  function onClickCapture(e: MouseEvent) {
    if (!suppressClick.current) return;
    e.preventDefault();
    e.stopPropagation();
    suppressClick.current = false;
  }

  const transition =
    anim === "out"
      ? `transform ${SLIDE_MS}ms ease-in`
      : anim === "spring"
        ? `transform ${SPRING_MS}ms cubic-bezier(0.2, 0.9, 0.3, 1.15)`
        : "none";

  return (
    <div
      ref={root}
      className={`swipe-row relative flex overflow-hidden ${className}`}
      style={{ touchAction: "pan-y" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      onClickCapture={onClickCapture}
    >
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-end bg-stop pr-5 text-sand"
        aria-hidden
      >
        <TrashIcon size={22} />
      </div>
      <div
        className="swipe-face relative flex w-full min-w-0"
        style={{ transform: `translate3d(${x}px,0,0)`, transition, touchAction: "pan-y" }}
        onTransitionEnd={onTransitionEnd}
      >
        <div className="min-w-0 flex-1">{children}</div>
        <button
          type="button"
          data-swipe-delete=""
          aria-label={label}
          className="relative flex w-14 shrink-0 items-center justify-center gap-0.5 self-stretch bg-inherit text-stop"
          style={{ touchAction: "pan-y" }}
          onClick={() => {
            if (exitingRef.current) return;
            onDelete();
          }}
        >
          <span className="absolute inset-0 bg-stop/15" aria-hidden />
          <span className="relative inline-flex items-center gap-0.5">
            <ChevronHint />
            <TrashIcon size={20} />
          </span>
        </button>
      </div>
    </div>
  );
}

function ChevronHint() {
  return (
    <svg
      width="10"
      height="16"
      viewBox="0 0 12 20"
      aria-hidden="true"
      className="swipe-hint text-stop/45"
      fill="none"
    >
      <path
        d="M9 2.5 3.2 10 9 17.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
