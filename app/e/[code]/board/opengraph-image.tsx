import {
  APP_NAME,
  APP_TAGLINE,
  BOARD_BG,
  BOARD_DIM,
  BOARD_SAND,
  BRAND_TRACK,
  boardShareHeadline,
} from "@/lib/brand";
import { getStoredEvent } from "@/lib/store";
import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = APP_NAME;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ code: string }> };

export default async function BoardOpenGraphImage({ params }: Props) {
  const { code } = await params;
  const event = await getStoredEvent(code);
  const headline = boardShareHeadline(event?.name);
  const icon = await readFile(join(process.cwd(), "public/icons/icon-512.png"));
  const src = `data:image/png;base64,${icon.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          background: BOARD_BG,
          color: BOARD_SAND,
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        }}
      >
        <div style={{ width: 8, height: 630, background: BRAND_TRACK }} />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            flex: 1,
            padding: "0 64px",
          }}
        >
          <img src={src} width={400} height={400} />
          <div style={{ display: "flex", flexDirection: "column", marginLeft: 48, flex: 1 }}>
            <div style={{ fontSize: 56, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1 }}>
              {headline.slice(0, 42)}
            </div>
            <div style={{ marginTop: 18, fontSize: 32, fontWeight: 600, color: BRAND_TRACK }}>
              {APP_TAGLINE}
            </div>
            <div
              style={{
                marginTop: 72,
                display: "flex",
                gap: 28,
                fontSize: 26,
                fontWeight: 700,
                fontFamily: "ui-monospace, SFMono-Regular, monospace",
                color: BOARD_DIM,
              }}
            >
              <span>1:12.4</span>
              <span>2:28.1</span>
              <span>3:45.0</span>
              <span>5:01.8</span>
              <span style={{ color: BRAND_TRACK }}>6:18.2</span>
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
