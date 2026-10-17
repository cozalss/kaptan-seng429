import Link from "next/link";
import { Wordmark } from "@/components/brand/marks";
import { Disclaimer } from "@/components/brand/disclaimer";
import { HOME } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

/** A page that does not exist: the panel's own column, one sentence, one way home, the disclaimer. */
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <header className="border-b-2 border-ink bg-panel">
        <div className="mx-auto flex h-16 max-w-[752px] items-center px-4 sm:px-6">
          <Wordmark className="h-7 w-auto" />
        </div>
      </header>
      <main className="mx-auto w-full max-w-[752px] flex-1 px-4 pt-16 pb-16 sm:px-6 sm:pt-24">
        <p className="text-dense font-semibold text-ink-soft tabular-nums">Hata 404</p>
        <h1 className="mt-3 font-display text-display tracking-[-0.015em] text-balance text-ink sm:text-display-lg">Sayfa bulunamadı.</h1>
        <p className="mt-4 max-w-[52ch] text-body text-ink-soft">Adres yanlış yazılmış ya da sayfa kaldırılmış olabilir.</p>
        <Link
          href={HOME}
          className={cn(buttonVariants({ variant: "primary", size: "lg" }), "mt-8")}
        >
          Bugün’e dön
          <span aria-hidden>→</span>
        </Link>
      </main>
      <div className="mx-auto w-full max-w-[752px] px-4 sm:px-6">
        <Disclaimer />
      </div>
    </div>
  );
}
