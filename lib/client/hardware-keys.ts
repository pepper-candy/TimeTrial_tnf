"use client";

import { useEffect, useRef } from "react";

/** True when the key should go to a real field, not a custom pad. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag !== "INPUT") return false;
  const type = (target as HTMLInputElement).type;
  return type !== "button" && type !== "submit" && type !== "checkbox" && type !== "radio" && type !== "hidden";
}

/**
 * Listen for hardware keys without focusing an input (so the OS keyboard
 * stays closed). Return true from onKey to preventDefault.
 */
export function useHardwareKeys(onKey: (e: KeyboardEvent) => boolean | void, enabled = true): void {
  const fn = useRef(onKey);
  fn.current = onKey;
  useEffect(() => {
    if (!enabled) return;
    function handle(e: KeyboardEvent) {
      if (e.defaultPrevented) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      if (fn.current(e)) e.preventDefault();
    }
    window.addEventListener("keydown", handle, true);
    return () => window.removeEventListener("keydown", handle, true);
  }, [enabled]);
}
