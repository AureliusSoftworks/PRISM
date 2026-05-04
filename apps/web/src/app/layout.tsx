import type { Metadata, Viewport } from "next";
import { Geist_Mono, Instrument_Sans, Raleway } from "next/font/google";
import { DisableNativeTooltips } from "./DisableNativeTooltips";
import "./globals.css";

const uiSans = Instrument_Sans({
  variable: "--font-ui-sans",
  subsets: ["latin"],
});

const titleSans = Raleway({
  variable: "--font-title-sans",
  subsets: ["latin"],
  weight: ["300"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Prism",
  description: "Local-first AI playground with per-account isolation.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${uiSans.variable} ${titleSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <body>
        <DisableNativeTooltips />
        {children}
      </body>
    </html>
  );
}
