import type { Metadata } from "next";

export const metadata: Metadata = { title: "Bell" };

export default function BellLayout({ children }: { children: React.ReactNode }) {
  return children;
}
