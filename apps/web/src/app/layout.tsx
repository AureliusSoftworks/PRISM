import type { Metadata, Viewport } from "next";
import { Geist_Mono, Instrument_Sans, Raleway } from "next/font/google";
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

// Strips every HTML `title=""` attribute application-wide so the operating
// system never renders its default tooltip overlay. The original value is
// copied to `data-title` so any future custom tooltip component can read it
// without a codebase-wide refactor. Runs as the first thing inside <body> so
// the observer is in place before any page content paints, avoiding the
// hydration flash where a native tooltip could briefly appear.
const DISABLE_NATIVE_TOOLTIPS_SCRIPT = `(function () {
  function stripTitle(el) {
    if (!el || el.nodeType !== 1 || !el.hasAttribute('title')) return;
    var value = el.getAttribute('title');
    if (value) el.setAttribute('data-title', value);
    el.removeAttribute('title');
  }
  function sweep(root) {
    if (!root || root.nodeType !== 1) return;
    stripTitle(root);
    var nodes = root.querySelectorAll && root.querySelectorAll('[title]');
    if (nodes) for (var i = 0; i < nodes.length; i++) stripTitle(nodes[i]);
  }
  sweep(document.documentElement);
  new MutationObserver(function (mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var m = mutations[i];
      if (m.type === 'attributes' && m.attributeName === 'title') {
        stripTitle(m.target);
      } else if (m.type === 'childList') {
        for (var j = 0; j < m.addedNodes.length; j++) sweep(m.addedNodes[j]);
      }
    }
  }).observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['title'],
  });
})();`;

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
        <script
          dangerouslySetInnerHTML={{ __html: DISABLE_NATIVE_TOOLTIPS_SCRIPT }}
        />
        {children}
      </body>
    </html>
  );
}
