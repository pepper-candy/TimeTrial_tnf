import type { Metadata } from "next";

export const metadata: Metadata = { title: "Timer" };

export default function TimerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
