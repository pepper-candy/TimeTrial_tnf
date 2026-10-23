import type { Metadata } from "next";

export const metadata: Metadata = { title: "Starter" };

export default function StarterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
