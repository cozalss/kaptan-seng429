import Link from "next/link";
import { Wordmark } from "@/components/brand/marks";
import { Disclaimer } from "@/components/brand/disclaimer";
import { HOME } from "@/lib/nav";
import { CalmSea } from "./login/calm-sea";

/**
 * A page that is not on the map: set in the panel's own reading column (not centred on the
 * screen), one plain sentence, one way home, the disclaimer, and the calm sea from the doors
 * as a quiet strip at the bottom (still under reduced motion).
 */
export default function NotFound() {
  return (
    <div className="relative min-h-dvh overflow-x-clip bg-paper">
      <main className="relative z-[2] mx-auto max-w-[752px] px-4 pt-24 pb-[150px] text-left sm:px-6">
        <Wordmark className="h-10 w-auto" />
        <p className="mt-14 text-dense font-medium text-ink-soft tabular-nums">404 · rota dışı</p>
        <h1 className="mt-3 font-display text-display text-balance text-ink sm:text-display-lg">Bu sayfa haritada yok.</h1>
        <p className="mt-4 text-body text-ink-soft">Adres yanlış yazılmış ya da ekran taşınmış olabilir.</p>
        <Link
          href={HOME}
          className="group mt-8 inline-flex min-h-11 items-center gap-1.5 text-body font-medium text-ink"
        >
          <span className="underline decoration-[1.5px] decoration-rule-ui underline-offset-4 group-hover:decoration-ink">Bugün’e dön</span>
          <span aria-hidden className="transition-transform duration-[var(--dur-quick)] ease-[var(--ease-ink)] group-hover:translate-x-1">
            →
          </span>
        </Link>
        <Disclaimer className="mt-12" />
      </main>
      <CalmSea className="pointer-events-none fixed inset-x-0 bottom-0 z-[1] h-[120px] w-full" />
    </div>
  );
}
