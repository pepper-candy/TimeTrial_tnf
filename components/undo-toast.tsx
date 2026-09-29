"use client";

import { useEffect, useState } from "react";

export function UndoToast({
  message,
  onUndo,
  onGone,
  ms = 5000,
}: {
  message: string;
  onUndo: () => void;
  onGone?: () => void;
  ms?: number;
}) {
  const [left, setLeft] = useState(true);
  useEffect(() => {
    const t = window.setTimeout(() => {
      setLeft(false);
      onGone?.();
    }, ms);
    return () => window.clearTimeout(t);
  }, [ms, onGone]);
  if (!left) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-3">
      <div
        className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-panel2 px-3 py-2 ring-1 ring-line shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <span className="text-sm font-semibold">{message}</span>
        <button
          type="button"
          className="tap h-11 rounded-xl bg-accent px-4 text-sm font-black text-ink"
          onClick={() => {
            setLeft(false);
            onUndo();
          }}
        >
          Undo
        </button>
      </div>
    </div>
  );
}
