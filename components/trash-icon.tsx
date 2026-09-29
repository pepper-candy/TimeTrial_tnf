/** Shared delete mark: a wide, squat bin with a thick lid. Colour follows currentColor. */
export function TrashIcon({
  size = 20,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="currentColor"
    >
      <path d="M8.6 1.7h6.8c.7 0 1.3.6 1.3 1.3V4H7.3V3c0-.7.6-1.3 1.3-1.3z" />
      <rect x="1.4" y="4.5" width="21.2" height="3.7" rx="1.5" />
      <path
        fillRule="evenodd"
        d="M3.7 9.6h16.6l-1.2 8.5a2.5 2.5 0 0 1-2.5 2.15H7.4a2.5 2.5 0 0 1-2.5-2.15L3.7 9.6zm4.15 2.05h1.7v5.5h-1.7v-5.5zm3.3 0h1.7v5.5h-1.7v-5.5zm3.3 0h1.7v5.5h-1.7v-5.5z"
      />
    </svg>
  );
}
