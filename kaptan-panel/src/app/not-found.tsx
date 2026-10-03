import Link from "next/link";
import { Wordmark } from "@/components/brand/marks";
import { HOME } from "@/lib/nav";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-paper px-6">
      <div className="max-w-[480px]">
        <Wordmark className="h-10 w-auto" />
        <h1 className="mt-10 font-display text-[40px] leading-[1.1] text-ink">Bu sayfa haritada yok.</h1>
        <p className="mt-3 text-[17px] text-ink-soft">Adres yanlış yazılmış ya da ekran taşınmış olabilir.</p>
        <Link href={HOME} className="mt-8 inline-block text-[16px] font-medium text-ink underline underline-offset-4">
          Bugün’e dön →
        </Link>
      </div>
    </main>
  );
}
