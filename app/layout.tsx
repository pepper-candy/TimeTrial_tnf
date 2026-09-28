import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "HKUST T&F Time Trial",
  description: "Distance time trials with two or three helpers",
  appleWebApp: { capable: true, title: "Time Trial", statusBarStyle: "black-translucent" },
  icons: { icon: "/icon.svg", apple: "/apple-icon" },
  openGraph: {
    title: "HKUST T&F Time Trial",
    description: "Stadium timing for distance time trials — Timer, Marker, Board.",
    siteName: "Time Trial",
  },
  twitter: {
    card: "summary_large_image",
    title: "HKUST T&F Time Trial",
    description: "Stadium timing for distance time trials.",
  },
};

export const viewport: Viewport = {
  themeColor: "#05060a",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full bg-void antialiased`}
    >
      <body className="min-h-full min-h-dvh bg-void text-sand font-sans">{children}</body>
    </html>
  );
}
