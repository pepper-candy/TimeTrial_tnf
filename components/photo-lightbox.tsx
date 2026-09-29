"use client";

export function PhotoLightbox({
  src,
  alt = "",
  onClose,
  onReplace,
}: {
  src: string;
  alt?: string;
  onClose: () => void;
  onReplace?: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-3"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="max-h-[92dvh] max-w-full object-contain"
        onClick={(e) => e.stopPropagation()}
      />
      {onReplace ? (
        <div
          className="absolute inset-x-0 bottom-0 flex justify-center p-4"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="tap h-12 rounded-xl bg-sand px-6 font-black text-ink"
            onClick={(e) => {
              e.stopPropagation();
              onReplace();
              onClose();
            }}
          >
            Replace
          </button>
        </div>
      ) : null}
    </div>
  );
}
