import type { Metadata, Viewport } from "next";
import {
  Chewy,
  Cormorant_Garamond,
  Fredoka,
  Geist_Mono,
  Instrument_Sans,
  Lora,
  Raleway,
} from "next/font/google";
import localFont from "next/font/local";
import { BlockBrowserInspection } from "./BlockBrowserInspection";
import { ClientInstallCoach } from "./ClientInstallCoach";
import { DisableNativeTooltips } from "./DisableNativeTooltips";
import { PRISM_BRAND_COPY } from "./prismBrand";
import { RenderPlatformAttribute } from "./RenderPlatformAttribute";
import { TextFieldContextMenu } from "./TextFieldContextMenu";
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

const formalSerif = Cormorant_Garamond({
  variable: "--font-formal-serif",
  subsets: ["latin"],
  weight: ["500", "600"],
});

const playfulDisplay = Chewy({
  variable: "--font-playful-display",
  subsets: ["latin"],
  weight: "400",
});

const conciseRounded = Fredoka({
  variable: "--font-concise-rounded",
  subsets: ["latin"],
  weight: ["600", "700"],
});

const dotoDisplay = localFont({
  src: "./fonts/Doto-Variable.ttf",
  variable: "--font-doto-display",
  weight: "100 900",
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Prism",
  description: `${PRISM_BRAND_COPY.slogan} A private, local-first AI workspace.`,
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
      className={`${uiSans.variable} ${titleSans.variable} ${chatSerif.variable} ${formalSerif.variable} ${playfulDisplay.variable} ${conciseRounded.variable} ${dotoDisplay.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <body>
        <RenderPlatformAttribute />
        <TextFieldContextMenu />
        <BlockBrowserInspection />
        <DisableNativeTooltips />
        {children}
        <ClientInstallCoach />
      </body>
    </html>
  );
}
