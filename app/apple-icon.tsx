import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#05060a",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          color: "#ffd21f",
          fontSize: 64,
          fontWeight: 800,
          fontFamily: "ui-monospace, monospace",
        }}
      >
        TT
      </div>
    ),
    size,
  );
}
