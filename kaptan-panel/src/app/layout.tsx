import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

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
  title: { default: "KAPtan Paneli", template: "%s · KAPtan Paneli" },
  description: "KAPtan yatırım masası paneli — SENG 429 ders projesi. Yatırım tavsiyesi değildir.",
  robots: { index: false, follow: false },
  applicationName: "KAPtan Paneli",
};

export const viewport: Viewport = {
  themeColor: "#eceef2",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" className={`${bodoni.variable} ${inter.variable} antialiased`}>
      <body>{children}</body>
    </html>
  );
}
