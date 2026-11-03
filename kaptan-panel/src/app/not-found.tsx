import Link from "next/link";
import "@/components/solo/solo.css";
import { Wordmark } from "@/components/brand/marks";
import { Boat } from "@/components/ufuk/boat";
import { Sea } from "@/components/ufuk/sea";
import { buttonVariants } from "@/components/ui/button";
import { HOME } from "@/lib/nav";
import { cn } from "@/lib/utils";

/** A page that does not exist: an empty horizon, a far-off boat, one sentence, one way home. */
export default function NotFound() {
  return (
    <div className="scene text-ink">
      <header className="u-page flex h-[72px] shrink-0 items-center">
        <Link href={HOME} aria-label="KAPtan, ana sayfa" className="flex h-11 items-center">
          <Wordmark className="solo-wordmark h-10 w-auto" title="KAPtan" />
        </Link>
      </header>
      <Sea className="scene-sea" />
      <Boat className="scene-boat scene-boat--far" />
      <main className="u-page flex-1 pt-[4vh] pb-[calc(max(38vh,220px)+2rem)] sm:pt-[8vh]">
        <h1 className="u-sentence scene-title text-ink">Sayfa bulunamadı.</h1>
        <p className="mt-5 max-w-[44ch] text-body text-ink-soft sm:text-[18px] sm:leading-7">Bu sularda böyle bir sayfa yok. Adres yanlış yazılmış ya da sayfa kaldırılmış olabilir.</p>
        <Link href={HOME} className={cn(buttonVariants({ variant: "primary", size: "lg" }), "mt-7")}>
          Ana sayfaya dön
          <span aria-hidden>→</span>
        </Link>
      </main>
    </div>
  );
}
