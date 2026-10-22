import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Finish Cam",
  other: { "screen-orientation": "landscape" },
};

export default function FinishCamLayout({ children }: { children: React.ReactNode }) {
  return children;
}
