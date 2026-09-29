"use client";

import { useLayoutEffect, useRef } from "react";

/** FLIP-reorder rows when rank changes. */
export function useFlip(ids: string[], duration = 320) {
  const nodes = useRef(new Map<string, HTMLElement>());
  const prev = useRef(new Map<string, number>());
  const key = ids.join("|");

  function bind(id: string) {
    return (el: HTMLElement | null) => {
      if (el) nodes.current.set(id, el);
      else nodes.current.delete(id);
    };
  }

  useLayoutEffect(() => {
    const next = new Map<string, number>();
    for (const id of ids) {
      const node = nodes.current.get(id);
      if (!node) continue;
      const top = node.getBoundingClientRect().top;
      next.set(id, top);
      const old = prev.current.get(id);
      if (old != null) {
        const dy = old - top;
        if (Math.abs(dy) > 1) {
          node.animate(
            [{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }],
            { duration, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
          );
        }
      }
    }
    prev.current = next;
    // ids captured via `key`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, duration]);

  return bind;
}
