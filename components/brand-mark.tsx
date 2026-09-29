import { APP_NAME } from "@/lib/brand";

export function BrandMark({
  className = "h-16 w-16",
  title = APP_NAME,
}: {
  className?: string;
  title?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/icon.svg" alt={title} className={className} width={64} height={64} />
  );
}
