import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Toaster } from "@/components/ui/toast";
import "./globals.css";

/* Self-hosted, subset to Latin + Turkish (OFL, see src/app/fonts/OFL.txt). */
const bodoni = localFont({
  src: "./fonts/bodoni-moda-display-latin-tr.woff2",
  weight: "400",
  style: "normal",
  variable: "--font-bodoni",
  display: "swap",
  fallback: ["Didot", "Georgia", "serif"], // no "Bodoni 72": next/font emits it unquoted, which invalidates the stack
});

const inter = localFont({
  src: "./fonts/inter-latin-tr.woff2",
  weight: "400 500",
  style: "normal",
  variable: "--font-inter",
  display: "swap",
  fallback: ["Helvetica Neue", "Arial", "sans-serif"],
});

const wordmark = localFont({
  src: "./fonts/bodoni-moda-wordmark.woff2",
  weight: "700",
  variable: "--font-wordmark-face",
  display: "block",
  preload: true,
});

export const metadata: Metadata = {
  title: { default: "KAPtan Paneli", template: "%s · KAPtan Paneli" },
  description: "KAPtan yatırım masası paneli — SENG 429 ders projesi. Yatırım tavsiyesi değildir.",
  robots: { index: false, follow: false },
  applicationName: "KAPtan Paneli",
};

export const viewport: Viewport = {
  themeColor: "#f3f1ec",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" className={`${bodoni.variable} ${inter.variable} ${wordmark.variable} antialiased`}>
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
