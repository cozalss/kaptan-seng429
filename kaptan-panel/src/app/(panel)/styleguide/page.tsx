import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/primitives";
import { Compass, InkRule, Wordmark } from "@/components/brand/marks";
import { StyleguideInteractive } from "./interactive";
import { StyleguideStatic } from "./static";

export const metadata: Metadata = { title: "Stil rehberi" };

/** /styleguide — the living design system. Owned by the foundation; read-only for S1–S4. */
export default function StyleguidePage() {
  return (
    <div className="space-y-10">
      <PageHeader
        kicker="Temel · /styleguide"
        title="Stil rehberi"
        meta="Pirinç kâğıdı, sumi mürekkebi, çivit yıkama. Kırmızı yalnızca kuzey içindir: kill switch, veto, kritik."
        actions={<Compass size={44} north />}
      />
      <section aria-labelledby="sg-brand" className="grid items-end gap-8 lg:grid-cols-[1fr_auto]">
        <div>
          <h2 id="sg-brand" className="sr-only">
            Marka
          </h2>
          <Wordmark className="h-14 w-auto" />
          <InkRule className="mt-4 max-w-[520px]" />
        </div>
        <p className="max-w-[420px] text-ui text-ink-soft">
          Başlıklar ve büyük rakamlar Bodoni Moda; arayüz Inter; mono yalnızca kod, hash ve kimlik için. Köşeler kare, kenarlar 1,5 px mürekkep, gölgeler sert.
        </p>
      </section>
      <StyleguideStatic />
      <StyleguideInteractive />
    </div>
  );
}
