"use client";

import { useRef } from "react";
import { useHardwareKeys } from "@/lib/client/hardware-keys";
import { padKeyFromEvent } from "@/lib/pad-keys";

export function NumberPad({
  value,
  onChange,
  onEnter,
  enterLabel = "OK",
}: {
  value: string;
  onChange: (v: string) => void;
  onEnter: () => void;
  enterLabel?: string;
}) {
  const valueRef = useRef(value);
  valueRef.current = value;
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const enterRef = useRef(onEnter);
  enterRef.current = onEnter;

  function apply(k: string) {
    const cur = valueRef.current;
    if (k === "⌫" || k === "back") changeRef.current(cur.slice(0, -1));
    else if (k === "clear") changeRef.current("");
    else if (k === "⏎" || k === "enter") enterRef.current();
    else if (/^\d$/.test(k) && cur.length < 8) changeRef.current(cur + k);
  }

  useHardwareKeys((e) => {
    const k = padKeyFromEvent(e);
    if (!k) return false;
    if (e.repeat && k !== "back") return false;
    apply(k);
    return true;
  });

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "⏎"];
  return (
    <div className="grid grid-cols-3 gap-2">
      {keys.map((k) => (
        <button
          key={k}
          type="button"
          className={`tap h-16 rounded-2xl text-2xl font-black tabular ring-1 active:scale-[0.98] ${
            k === "⏎" ? "bg-accent text-ink ring-accent" : "bg-panel2 text-sand ring-line"
          }`}
          onPointerDown={(e) => {
            e.preventDefault();
            apply(k);
          }}
        >
          {k === "⏎" ? enterLabel : k}
        </button>
      ))}
    </div>
  );
}
