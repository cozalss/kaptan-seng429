import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "@/components/solo/solo.css";
import { Wordmark } from "@/components/brand/marks";
import { Boat } from "@/components/ufuk/boat";
import { Sea } from "@/components/ufuk/sea";
import { buttonVariants } from "@/components/ui/button";
import { SITE_ONLY } from "@/lib/api/config";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Panel burada açılmaz" };

const REPO_URL = "https://github.com/cozalss/kaptan-seng429";

/**
 * The public website has no API behind it, so /login and every app route land here (src/proxy.ts):
 * one honest page and the way back, no login form. On a real install this path does not exist.
 */
export default function SiteOnlyPage() {
  if (!SITE_ONLY) notFound();
  return (
    <div className="scene text-ink">
      <header className="u-page flex h-[72px] shrink-0 items-center">
        <a href="/" aria-label="KAPtan, tanıtım sayfası" className="flex h-11 items-center">
          <Wordmark className="solo-wordmark h-10 w-auto" title="KAPtan" />
        </a>
      </header>
      <Sea className="scene-sea" />
      <Boat className="scene-boat scene-boat--far" />
      <main className="u-page flex-1 pt-[4vh] pb-[calc(max(38vh,220px)+2rem)] sm:pt-[8vh]">
        <h1 className="u-sentence scene-title text-ink">KAPtan senin bilgisayarında çalışır; panel burada açılmaz.</h1>
        <p className="mt-5 max-w-[46ch] text-body text-ink-soft sm:text-[18px] sm:leading-7">
          Bu adres yalnızca tanıtım sayfası. Paranı, önerilerini ve geçmişini kendi bilgisayarına kurduğun KAPtan’da görürsün; hiçbiri buraya gelmez.
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3">
          <a href="/" className={cn(buttonVariants({ variant: "primary", size: "lg" }))}>
            Tanıtım sayfasına dön
            <span aria-hidden>→</span>
          </a>
          <a href={REPO_URL} className="inline-flex min-h-11 items-center text-body font-medium text-ink underline decoration-rule-ui underline-offset-4 hover:decoration-ink">
            Nasıl kurulur?
          </a>
        </div>
      </main>
    </div>
  );
}
