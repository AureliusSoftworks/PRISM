import type { Metadata, Viewport } from "next";
import {
  Chewy,
  Cormorant_Garamond,
  Fredoka,
  Geist_Mono,
  Instrument_Sans,
  Lora,
  Macondo,
  Noto_Sans_Mono,
  Raleway,
} from "next/font/google";
import { BlockBrowserInspection } from "./BlockBrowserInspection";
import { ClientInstallCoach } from "./ClientInstallCoach";
import { DisableNativeTooltips } from "./DisableNativeTooltips";
import { PrismIntroSequenceProvider } from "./PrismIntroSequence";
import { PRISM_BRAND_COPY } from "./prismBrand";
import { PrismMenuProvider } from "./PrismMenu";
import { PrismRefractionGateProvider } from "./prismRefractionGate";
import { RenderPlatformAttribute } from "./RenderPlatformAttribute";
import { ReplayRenderCoordinator } from "./ReplayRenderCoordinator";
import { TextEntryLengthDefaults } from "./TextEntryLengthDefaults";
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

const macondoFace = Macondo({
  variable: "--font-macondo-face",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

const technicalMono = Noto_Sans_Mono({
  variable: "--font-technical-mono",
  // The animated face vocabulary requires native ɵ and ʘ glyphs.
  subsets: ["latin", "latin-ext"],
  weight: "variable",
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
      className={`${uiSans.variable} ${titleSans.variable} ${chatSerif.variable} ${formalSerif.variable} ${playfulDisplay.variable} ${conciseRounded.variable} ${macondoFace.variable} ${technicalMono.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <body>
        <PrismMenuProvider>
          <PrismIntroSequenceProvider>
            <PrismRefractionGateProvider>
              <RenderPlatformAttribute />
              <TextFieldContextMenu />
              <TextEntryLengthDefaults />
              <BlockBrowserInspection />
              <DisableNativeTooltips />
              <ReplayRenderCoordinator />
              {children}
              <ClientInstallCoach />
            </PrismRefractionGateProvider>
          </PrismIntroSequenceProvider>
        </PrismMenuProvider>
      </body>
    </html>
  );
}
