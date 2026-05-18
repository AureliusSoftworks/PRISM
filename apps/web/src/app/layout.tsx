import type { Metadata, Viewport } from "next";
import { Geist_Mono, Instrument_Sans, Lora, Raleway } from "next/font/google";
import { BlockBrowserInspection } from "./BlockBrowserInspection";
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

const chatSerif = Lora({
  variable: "--font-chat-serif",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Prism",
  description: "Local-first AI playground with per-account isolation.",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    title: "Prism",
    statusBarStyle: "black-translucent",
  },
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
      className={`${uiSans.variable} ${titleSans.variable} ${chatSerif.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <body>
        <BlockBrowserInspection />
        <DisableNativeTooltips />
        {children}
      </body>
    </html>
  );
}
