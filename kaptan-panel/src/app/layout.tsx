import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { headers } from "next/headers";
import { connection } from "next/server";
import "./globals.css";
import "@/components/ufuk/ufuk.css";
import "@/lib/prefs/look.css";
import { LOOK_SCRIPT } from "@/lib/prefs/look-script";

/*
 * Self-hosted, subset to Latin + Turkish (OFL, see src/app/fonts/OFL.txt). Inter carries
 * everything; Bodoni Moda (display cut) is kept for page titles of 32px and up. The wordmark
 * needs no font: it is drawn as outlines (components/brand/marks.tsx).
 */
const bodoni = localFont({
  src: "./fonts/bodoni-moda-display-latin-tr.woff2",
  weight: "400",
  style: "normal",
  variable: "--font-bodoni",
  display: "swap",
  adjustFontFallback: "Times New Roman",
  fallback: ["Didot", "Georgia", "serif"], // no "Bodoni 72": next/font emits it unquoted, which invalidates the stack
});

const inter = localFont({
  src: "./fonts/inter-latin-tr.woff2",
  weight: "400 600",
  style: "normal",
  variable: "--font-inter",
  display: "swap",
  fallback: ["Helvetica Neue", "Arial", "sans-serif"],
});

export const metadata: Metadata = {
  title: { default: "KAPtan", template: "%s · KAPtan" },
  description: "KAPtan şirket bildirimlerini senin için okur, sade öneriler sunar. Karar senin.",
  robots: { index: false, follow: false },
  applicationName: "KAPtan",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef0f4" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0f1d" },
  ],
  colorScheme: "light dark",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Rendered per request: a static page could not carry the CSP nonce (src/proxy.ts) on its scripts.
  await connection();
  // The remembered theme and text size are put on <html> before the first paint (lib/prefs/look-script.ts); the
  // script carries the same nonce as Next's own (src/proxy.ts).
  const nonce = /'nonce-([^']+)'/.exec((await headers()).get("content-security-policy") ?? "")?.[1];
  return (
    <html lang="tr" className={`${bodoni.variable} ${inter.variable} antialiased`} suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: LOOK_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
