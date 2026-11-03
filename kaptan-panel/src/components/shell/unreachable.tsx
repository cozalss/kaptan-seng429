import { MSG_UNREACHABLE } from "@/lib/api/types";
import { Wordmark } from "@/components/brand/marks";
import { Boat } from "@/components/ufuk/boat";
import { Sea } from "@/components/ufuk/sea";
import { Button } from "@/components/ui/button";

const NEXT_STEP = "KAPtan açıksa birkaç saniye sonra yeniden dene. Kapalıysa önce onu başlat.";

/** On the sign-in sheet: the API does not answer, so a password field would only mislead. */
export function UnreachableNote({ onRetry, pending }: { onRetry: () => void; pending: boolean }) {
  return (
    <div role="alert">
      <p className="text-body font-semibold text-ink">{MSG_UNREACHABLE}</p>
      <p className="mt-2 text-body text-ink-soft">{NEXT_STEP}</p>
      <Button variant="primary" size="lg" className="mt-4 w-full text-[16px]" pending={pending} disabled={pending} onClick={onRetry}>
        {pending ? "Bakılıyor…" : "Yeniden dene"}
      </Button>
    </div>
  );
}

/** In place of the app when the API does not answer: one sentence, one way forward, never stale or made-up figures. */
export function UnreachableScreen({ onRetry, pending }: { onRetry: () => void; pending: boolean }) {
  return (
    <div data-solo className="scene text-ink">
      <header className="u-page flex h-[72px] shrink-0 items-center">
        <Wordmark className="solo-wordmark h-10 w-auto" title="KAPtan" />
      </header>
      <Sea className="scene-sea" />
      <Boat className="scene-boat scene-boat--far" />
      <main role="alert" className="u-page flex-1 pt-[4vh] pb-[calc(max(38vh,220px)+2rem)] sm:pt-[8vh]">
        <h1 className="u-sentence scene-title text-ink">{MSG_UNREACHABLE}</h1>
        <p className="mt-5 max-w-[44ch] text-body text-ink-soft sm:text-[18px] sm:leading-7">{NEXT_STEP}</p>
        <Button variant="primary" size="lg" className="mt-7" pending={pending} disabled={pending} onClick={onRetry}>
          {pending ? "Bakılıyor…" : "Yeniden dene"}
        </Button>
      </main>
    </div>
  );
}
