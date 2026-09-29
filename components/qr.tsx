"use client";

import { useEffect, useState } from "react";

export function Qr({ value, size = 168 }: { value: string; size?: number }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let alive = true;
    import("qrcode").then((mod) =>
      mod.toDataURL(value, {
        width: size * 2,
        margin: 1,
        color: { dark: "#05060a", light: "#ffffff" },
      }),
    ).then((url) => {
      if (alive) setSrc(url);
    });
    return () => {
      alive = false;
    };
  }, [value, size]);
  if (!src) {
    return <div className="rounded-xl bg-panel2" style={{ width: size, height: size }} />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="QR" width={size} height={size} className="rounded-xl" />
  );
}
