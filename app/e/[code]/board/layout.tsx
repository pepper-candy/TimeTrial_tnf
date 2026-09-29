import { APP_DESCRIPTION, APP_TAGLINE, boardDocumentTitle } from "@/lib/brand";
import { getStoredEvent } from "@/lib/store";
import type { Metadata } from "next";

type Props = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const event = await getStoredEvent(code);
  const title = boardDocumentTitle(event?.name ?? "");
  return {
    title: { absolute: title },
    description: APP_DESCRIPTION,
    openGraph: {
      title,
      description: APP_TAGLINE,
    },
    twitter: {
      title,
      description: APP_TAGLINE,
    },
  };
}

export default function BoardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
