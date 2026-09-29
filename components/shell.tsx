"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { placePopover } from "@/lib/popover";

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

const ICON_BTN =
  "tap grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-panel2 text-xl font-black ring-1 ring-line active:bg-sand active:text-ink";

/**
 * Same geometry on every page: Back far left; menu and (i) far right.
 * Empty slots keep their space so buttons never move between pages.
 */
export function TopBar({
  backHref,
  title,
  menu,
  info,
  className = "",
}: {
  backHref?: string;
  title?: React.ReactNode;
  menu?: React.ReactNode;
  info?: string;
  className?: string;
}) {
  return (
    <header
      className={`sticky top-0 z-30 grid h-16 shrink-0 grid-cols-[3rem_minmax(0,1fr)_6.5rem] items-center gap-2 bg-void/90 px-3 backdrop-blur ${className}`}
    >
      {backHref ? (
        <Link href={backHref} className={ICON_BTN} aria-label="Back">
          ←
        </Link>
      ) : (
        <span className="h-12 w-12" />
      )}
      <div className="flex min-w-0 items-center justify-center">
        {typeof title === "string" ? (
          <h1 className="truncate text-center text-base font-black uppercase tracking-[0.16em]">
            {title}
          </h1>
        ) : (
          title
        )}
      </div>
      <div className="flex justify-end gap-2">
        {menu ?? <span className="h-12 w-12" />}
        {info ? <InfoTip text={info} /> : <span className="h-12 w-12" />}
      </div>
    </header>
  );
}

export function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDoc(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className={`${ICON_BTN} font-serif italic text-dim`}
        onClick={() => setOpen((v) => !v)}
        aria-label="Info"
      >
        i
      </button>
      {open ? (
        <div className="absolute right-0 z-40 mt-2 w-72 rounded-2xl bg-panel2 p-4 text-sm leading-snug text-sand shadow-2xl ring-1 ring-line">
          {text}
        </div>
      ) : null}
    </div>
  );
}

const MENU_WIDTH = 352;

/** ⋯ button. Menu is portaled to the body so the top bar's blur cannot trap it. */
export function MenuButton({
  title,
  children,
}: {
  title?: string;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button
        ref={btn}
        type="button"
        className={ICON_BTN}
        aria-label="Menu"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        ⋯
      </button>
      {open
        ? createPortal(
            <AnchoredMenu anchor={btn} title={title} onClose={close}>
              {children(close)}
            </AnchoredMenu>,
            document.body,
          )
        : null}
    </>
  );
}

/**
 * Opens downward under the button, right-aligned, and flips above only when
 * that fits better. Taller than the space: scrolls. Outside click and Esc close it.
 */
function AnchoredMenu({
  anchor,
  title,
  onClose,
  children,
}: {
  anchor: React.RefObject<HTMLElement | null>;
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = panel.current;
    if (!el) return;

    function apply() {
      const panelEl = panel.current;
      const anchorEl = anchor.current;
      if (!panelEl || !anchorEl) return;
      const width = Math.min(MENU_WIDTH, window.innerWidth - 16);
      panelEl.style.width = `${width}px`;
      const r = anchorEl.getBoundingClientRect();
      const box = placePopover({
        anchor: { top: r.top, left: r.left, width: r.width, height: r.height },
        size: { width, height: panelEl.scrollHeight },
        viewport: { width: window.innerWidth, height: window.innerHeight },
      });
      panelEl.style.top = `${box.top}px`;
      panelEl.style.left = `${box.left}px`;
      panelEl.style.maxWidth = `${box.maxWidth}px`;
      panelEl.style.maxHeight = `${box.maxHeight}px`;
      panelEl.style.visibility = "visible";
    }

    apply();
    window.addEventListener("resize", apply);
    window.addEventListener("scroll", apply, true);
    return () => {
      window.removeEventListener("resize", apply);
      window.removeEventListener("scroll", apply, true);
    };
  }, [anchor, children]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div
        ref={panel}
        role="menu"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={{ visibility: "hidden" }}
        className="fixed overflow-auto rounded-2xl bg-panel p-4 shadow-2xl ring-1 ring-line"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="text-sm font-black uppercase tracking-[0.16em] text-dim">{title}</div>
          <button type="button" className={ICON_BTN} aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Sheet({
  title,
  onClose,
  children,
}: {
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70" onClick={onClose}>
      <div
        className="sheet-up max-h-[88dvh] w-full max-w-lg overflow-auto rounded-t-3xl bg-panel p-4 pb-6 ring-1 ring-line sm:mb-6 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="text-sm font-black uppercase tracking-[0.16em] text-dim">{title}</div>
          <button type="button" className={ICON_BTN} aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const CHIP_SIZES = {
  sm: "h-10 rounded-full px-3 text-sm",
  md: "h-12 rounded-full px-4 text-base",
  lg: "h-14 rounded-2xl px-4 text-lg font-black",
  icon: "grid h-12 w-12 place-items-center rounded-2xl text-sm font-black",
} as const;

/** Tap-to-toggle chip: inverted colours when on. */
export function Chip({
  active,
  onClick,
  children,
  className = "",
  size = "md",
}: {
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
  size?: keyof typeof CHIP_SIZES;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`tap shrink-0 font-bold ring-1 transition-colors ${CHIP_SIZES[size]} ${
        active ? "bg-sand text-ink ring-sand" : "bg-panel2 text-sand ring-line"
      } ${className}`}
    >
      {children}
    </button>
  );
}

type BtnTone = "accent" | "plain" | "go" | "danger";

const TONES: Record<BtnTone, string> = {
  accent: "bg-accent text-ink shadow-[inset_0_-4px_0_rgba(0,0,0,0.25)]",
  plain: "bg-panel2 text-sand ring-1 ring-line",
  go: "bg-go text-ink shadow-[inset_0_-4px_0_rgba(0,0,0,0.25)]",
  danger: "bg-stop text-sand",
};

export function BigBtn({
  children,
  onClick,
  href,
  disabled,
  tone = "accent",
  size = "lg",
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  tone?: BtnTone;
  size?: "md" | "lg";
  className?: string;
}) {
  const cls = `tap grid place-items-center rounded-2xl px-4 font-black active:scale-[0.99] disabled:opacity-40 ${
    size === "md" ? "h-14 text-lg" : "h-16 text-xl"
  } ${TONES[tone]} ${className}`;
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
  autoFocus,
  size = "md",
  invalid,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
  className?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  onSubmit?: () => void;
  autoFocus?: boolean;
  size?: "md" | "lg";
  invalid?: boolean;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      type={type}
      inputMode={inputMode}
      autoFocus={autoFocus}
      onKeyDown={(e) => {
        if (e.key === "Enter") onSubmit?.();
      }}
      onBlur={() => onSubmit?.()}
      className={`w-full rounded-2xl bg-panel2 px-4 text-sand ring-1 placeholder:text-dim ${
        size === "lg" ? "h-16 text-2xl" : "h-14 text-lg"
      } ${invalid ? "ring-stop" : "ring-line"} ${className}`}
    />
  );
}

export function Stat({
  value,
  label,
  warn,
  className = "",
}: {
  value: React.ReactNode;
  label: string;
  warn?: boolean;
  className?: string;
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      <div
        className={`font-mono text-3xl font-black tabular leading-none ${warn ? "text-bell" : "text-sand"}`}
      >
        {value}
      </div>
      <div className="mt-1.5 text-[11px] font-bold uppercase tracking-wider text-dim">{label}</div>
    </div>
  );
}

/** Row of copy-to-clipboard feedback: "Copied" for a moment. */
export function useCopied(ms = 1400) {
  const [copied, setCopied] = useState<string | null>(null);
  async function copy(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      window.setTimeout(() => setCopied((c) => (c === id ? null : c)), ms);
    } catch {
      /* clipboard blocked */
    }
  }
  return { copied, copy };
}
