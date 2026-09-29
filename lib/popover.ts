export type PopoverRect = { top: number; left: number; width: number; height: number };

export type PopoverPlace = {
  top: number;
  left: number;
  /** Cap so a tall menu scrolls instead of leaving the viewport. */
  maxHeight: number;
  maxWidth: number;
  placement: "below" | "above";
};

/**
 * Place a popover under its anchor, right-aligned.
 * Flips above only when it does not fit below and there is more room above.
 * Shifts horizontally so it stays inside the viewport.
 */
export function placePopover(opts: {
  anchor: PopoverRect;
  size: { width: number; height: number };
  viewport: { width: number; height: number };
  gap?: number;
  margin?: number;
}): PopoverPlace {
  const gap = opts.gap ?? 8;
  const margin = opts.margin ?? 8;
  const { anchor, size, viewport } = opts;

  const maxWidth = Math.max(0, viewport.width - margin * 2);
  const width = Math.min(Math.max(0, size.width), maxWidth);

  let left = anchor.left + anchor.width - width;
  const maxLeft = Math.max(margin, viewport.width - margin - width);
  left = Math.min(Math.max(left, margin), maxLeft);

  const belowTop = anchor.top + anchor.height + gap;
  const spaceBelow = viewport.height - margin - belowTop;
  const spaceAbove = anchor.top - gap - margin;
  const placement: "below" | "above" =
    size.height > spaceBelow && spaceAbove > spaceBelow ? "above" : "below";

  if (placement === "below") {
    return {
      placement,
      top: belowTop,
      left,
      maxHeight: Math.max(0, spaceBelow),
      maxWidth,
    };
  }

  const maxHeight = Math.max(0, spaceAbove);
  const used = Math.min(Math.max(0, size.height), maxHeight);
  return {
    placement,
    top: Math.max(margin, anchor.top - gap - used),
    left,
    maxHeight,
    maxWidth,
  };
}
