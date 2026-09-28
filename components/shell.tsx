"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export function Screen({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`mx-auto flex min-h-dvh w-full max-w-3xl flex-col ${className}`}>
      {children}
    </div>
  );
}

export function TopBar({
  backHref,
  title,
  right,
}: {
  backHref?: string;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <header className="flex items-center gap-2 px-3 py-2">
      {backHref ? (
        <Link
          href={backHref}
          className="tap grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-panel2 text-lg font-semibold"
        >
          ←
        </Link>
      ) : (
        <div className="w-11" />
      )}
      <h1 className="min-w-0 flex-1 truncate text-center text-sm font-semibold tracking-wide uppercase">
        {title}
      </h1>
      <div className="flex min-w-11 shrink-0 justify-end">{right}</div>
    </header>
  );
}

export function Chip({
  active,
  onClick,
  children,
  className = "",
}: {
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`tap rounded-full px-3.5 py-2 text-sm font-semibold ${
        active ? "bg-gold text-ink" : "bg-panel2 text-sand"
      } ${className}`}
    >
      {children}
    </button>
  );
}

export function GoldBtn({
  children,
  onClick,
  href,
  disabled,
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  className?: string;
}) {
  const cls = `tap grid h-14 place-items-center rounded-2xl bg-gold text-ink text-lg font-bold disabled:opacity-40 ${className}`;
  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cls}>
      {children}
    </button>
  );
}

export function Field({
  value,
  onChange,
  placeholder,
  type = "text",
  className = "",
  inputMode,
  onSubmit,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
  className?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  onSubmit?: () => void;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      type={type}
      inputMode={inputMode}
      onKeyDown={(e) => {
        if (e.key === "Enter") onSubmit?.();
      }}
      className={`h-12 w-full rounded-xl bg-panel2 px-3 text-sand placeholder:text-dim ${className}`}
    />
  );
}

export function HelpTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className="tap grid h-11 w-11 place-items-center rounded-xl bg-panel2 text-dim"
        onClick={() => setOpen((v) => !v)}
        aria-label="Help"
      >
        ⓘ
      </button>
      {open ? (
        <div className="absolute right-0 z-30 mt-1 w-64 rounded-xl bg-panel2 p-3 text-sm leading-snug text-sand shadow-xl">
          {text}
        </div>
      ) : null}
    </div>
  );
}

export function Stat({
  value,
  label,
  warn,
}: {
  value: React.ReactNode;
  label: string;
  warn?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div
        className={`font-mono text-2xl font-semibold tabular leading-none ${warn ? "text-bell" : "text-sand"}`}
      >
        {value}
      </div>
      <div className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-dim">
        {label}
      </div>
    </div>
  );
}
