import type { Metadata } from "next";

export const metadata: Metadata = { title: "New Event" };

export default function CreateLayout({ children }: { children: React.ReactNode }) {
  return children;
}
