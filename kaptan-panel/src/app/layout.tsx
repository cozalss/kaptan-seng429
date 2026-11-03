import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { connection } from "next/server";
import "./globals.css";
import "@/components/ufuk/ufuk.css";

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
  return (
    <html lang="tr" className={`${bodoni.variable} ${inter.variable} antialiased`}>
      <body>{children}</body>
    </html>
  );
}
