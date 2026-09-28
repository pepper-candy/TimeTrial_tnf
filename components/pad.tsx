"use client";

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
  function key(k: string) {
    if (k === "⌫") onChange(value.slice(0, -1));
    else if (k === "⏎") onEnter();
    else if (value.length < 8) onChange(value + k);
  }
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "⏎"];
  return (
    <div className="grid grid-cols-3 gap-2">
      {keys.map((k) => (
        <button
          key={k}
          type="button"
          className={`tap h-16 rounded-2xl text-2xl font-black tabular ring-1 active:scale-[0.98] ${
            k === "⏎" ? "bg-gold text-ink ring-gold" : "bg-panel2 text-sand ring-line"
          }`}
          onPointerDown={(e) => {
            e.preventDefault();
            key(k);
          }}
        >
          {k === "⏎" ? enterLabel : k}
        </button>
      ))}
    </div>
  );
}
