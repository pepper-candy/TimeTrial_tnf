import { ImageResponse } from "next/og";

export const alt = "HKUST T&F Time Trial";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#05060a",
          color: "#fff8ec",
          padding: "64px 72px",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div
            style={{
              fontSize: 22,
              letterSpacing: "0.35em",
              fontWeight: 700,
              color: "#ffd21f",
              textTransform: "uppercase",
            }}
          >
            HKUST T&F
          </div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: "#2ee59b",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
            }}
          >
            Live timing
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 92,
              fontWeight: 800,
              letterSpacing: "-0.04em",
              fontFamily: "ui-monospace, SFMono-Regular, monospace",
            }}
          >
            TIME TRIAL
          </div>
          <div style={{ marginTop: 16, fontSize: 28, color: "#c4cce0" }}>
            Distance races · Timer · Marker · Board
          </div>
        </div>
        <div
          style={{
            display: "flex",
            height: 14,
            width: "100%",
            backgroundImage:
              "repeating-linear-gradient(90deg, #05060a 0 18px, #ffd21f 18px 28px)",
          }}
        />
      </div>
    ),
    size,
  );
}
