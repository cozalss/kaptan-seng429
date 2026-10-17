import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

/*
 * Self-hosted, subset to Latin + Turkish (OFL, see src/app/fonts/OFL.txt). Two Bodoni Moda
 * cuts: the display cut (opsz 96) for the big titles, the text cut (opsz 28) for 24–32px
 * lines, where the display hairlines would break up. Inter carries everything read fast.
 * The wordmark needs no font: it is drawn as outlines (components/brand/marks.tsx).
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

const bodoniText = localFont({
  src: "./fonts/bodoni-moda-text-latin-tr.woff2",
  weight: "400",
  style: "normal",
  variable: "--font-bodoni-text",
  display: "swap",
  preload: true,
  adjustFontFallback: "Times New Roman",
  fallback: ["Georgia", "serif"],
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
  themeColor: "#eeeae0",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" className={`${bodoni.variable} ${bodoniText.variable} ${inter.variable} antialiased`}>
      <body>{children}</body>
    </html>
  );
}
