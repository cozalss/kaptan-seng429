import Link from "next/link";
import { Compass } from "@/components/brand/marks";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-paper px-6">
      <div className="max-w-[520px]">
        <Compass size={72} />
        <p className="mt-6 text-meta text-muted">404</p>
        <h1 className="title-display mt-2 text-[44px] text-ink">Bu sayfa haritada yok.</h1>
        <p className="mt-3 text-ui text-ink-soft">Adres yanlış yazılmış ya da ekran taşınmış olabilir.</p>
        <Button asChild variant="primary" className="mt-6">
          <Link href="/login">Masaya dön</Link>
        </Button>
      </div>
    </main>
  );
}
