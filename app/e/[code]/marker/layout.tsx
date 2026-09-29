import type { Metadata } from "next";

export const metadata: Metadata = { title: "Marker" };

export default function MarkerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
