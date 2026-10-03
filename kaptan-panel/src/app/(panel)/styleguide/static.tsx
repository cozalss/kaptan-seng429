import type { ReactNode } from "react";
import { Badge, EventBadge, FixtureBadge, RuleMark, SeverityBadge, TemsiliBadge } from "@/components/ui/badge";
import { Panel, PanelBody, PanelFooter, PanelHeader } from "@/components/ui/panel";
import { EmptyState, ErrorState, Kbd, LlmNote, SampleNote, SkeletonLines, Stat } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { fmtPct, fmtSignedPct, fmtTry } from "@/lib/format";

const SWATCHES: { token: string; name: string; use: string; dark?: boolean }[] = [
  { token: "--paper", name: "Pirinç kâğıdı", use: "Sayfa zemini" },
  { token: "--panel", name: "Panel", use: "Kart ve tablo yüzeyi" },
  { token: "--sunk", name: "Gömük", use: "Kod, girdi zemini" },
  { token: "--ink", name: "Sumi mürekkebi", use: "Metin, kenar, gölge", dark: true },
  { token: "--ink-soft", name: "Yumuşak mürekkep", use: "İkincil metin", dark: true },
  { token: "--muted", name: "Soluk", use: "Meta, etiket", dark: true },
  { token: "--wash", name: "Çivit yıkama", use: "Bilgi, seçim, durum", dark: true },
  { token: "--brand", name: "Derin çivit", use: "Odak halkası", dark: true },
  { token: "--ochre", name: "Aşı boyası", use: "Yalnızca günlük durdurma" },
  { token: "--north", name: "Kuzey kırmızısı", use: "Kill switch, veto, kritik", dark: true },
];

function Section({ id, title, lead, children }: { id: string; title: string; lead: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid gap-5 border-t-[1.5px] border-ink pt-6 lg:grid-cols-[220px_minmax(0,1fr)]">
      <div>
        <h2 id={id} className="font-display text-[26px] leading-tight text-ink">
          {title}
        </h2>
        <p className="mt-1.5 text-dense text-muted">{lead}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

/** Server-rendered half of the styleguide: tokens, type, badges, panels, states. */
export function StyleguideStatic() {
  return (
    <>
      <Section id="sg-color" title="Renk" lead="Anlamlı renk: her tonun bir işi var. Kırmızı süsleme değildir.">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {SWATCHES.map((s) => (
            <li key={s.token} className="border-[1.5px] border-ink bg-panel">
              <div className="h-16 border-b-[1.5px] border-ink" style={{ background: `var(${s.token})` }} />
              <div className="px-2.5 py-2">
                <div className="text-dense font-medium text-ink">{s.name}</div>
                <div className="code text-muted">{s.token}</div>
                <div className="mt-0.5 text-meta text-ink-soft">{s.use}</div>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="sg-type" title="Tipografi" lead="Bodoni Moda başlık ve büyük rakam; Inter 12 / 13 / 14 arayüz; mono kod.">
        <div className="space-y-5">
          <p className="title-display text-[56px] text-ink">Neden bu işlem?</p>
          <p className="font-display text-[34px] leading-tight text-ink">Onay kuyruğu · 3 bekliyor</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <p className="text-ui text-ink">
              <span className="block text-meta text-muted">ui · 14</span>Risk kapısından geçen öneri bir insan kararını bekler.
            </p>
            <p className="text-dense text-ink">
              <span className="block text-meta text-muted">dense · 13</span>Tablo hücresi, yoğun liste, form yardımı.
            </p>
            <p className="text-meta text-ink">
              <span className="block text-meta text-muted">meta · 12</span>Etiket, zaman damgası, kaynak satırı.
            </p>
          </div>
          <p className="text-dense text-ink-soft">
            Kod: <span className="code text-ink">run-demo-e3-ornek</span> · <span className="code text-ink">sha256:9f2c…e41a</span> · <span className="code text-ink">R07</span>
          </p>
        </div>
      </Section>

      <Section id="sg-numbers" title="Rakamlar" lead="Bir ekranın konusu olan 1–3 sayı büyük yazılır; altı tane yan yana asla.">
        <div className="flex flex-wrap items-end gap-x-12 gap-y-6">
          <Stat label="Sanal sermaye" value={fmtTry(1_016_480)} hint={<SampleNote />} size="lg" />
          <Stat label="Günlük K/Z" value={fmtSignedPct(0.0021)} tone="wash" />
          <Stat label="Drawdown" value={fmtSignedPct(-0.0521)} tone="north" hint="Eşik −%5 aşıldı" />
          <Stat label="Pozisyon payı" value={fmtPct(0.18, 0)} size="sm" />
        </div>
      </Section>

      <Section id="sg-badges" title="Damgalar" lead="Kare, 1 px kenar. Ton = anlam.">
        <div className="flex flex-wrap items-center gap-2">
          <EventBadge type="E1" />
          <EventBadge type="E3" />
          <EventBadge type="E4" compact />
          <EventBadge type="FILTER" />
          <Badge tone="wash">Sınıflandı</Badge>
          <Badge tone="wash-solid">Onay bekliyor</Badge>
          <Badge tone="ochre">Günlük durdurma</Badge>
          <Badge tone="north-solid">Kill switch AÇIK</Badge>
          <SeverityBadge severity="info" />
          <SeverityBadge severity="reduce" />
          <SeverityBadge severity="veto" />
          <SeverityBadge severity="critical" />
          <FixtureBadge />
          <TemsiliBadge />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-5">
          <RuleMark passed label={<span className="code">E3.min_confidence</span>} />
          <RuleMark passed={false} label={<span className="code">R04 engel listesi</span>} critical />
          <RuleMark passed={false} label={<span className="code">EDGE.min_n</span>} />
          <span className="flex items-center gap-1.5 text-dense text-ink-soft">
            Komut paleti <Kbd>Ctrl</Kbd>
            <Kbd>K</Kbd>
          </span>
          <SampleNote />
          <LlmNote />
        </div>
      </Section>

      <Section id="sg-buttons" title="Düğmeler" lead="Birincil mürekkep; tehlike yalnızca geri dönüşü zor eylemler için.">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary">Onayla</Button>
          <Button variant="secondary">Küçült</Button>
          <Button variant="outline">Açıklamayı aç</Button>
          <Button variant="ghost">Vazgeç</Button>
          <Button variant="danger-outline">Reddet</Button>
          <Button variant="danger">Kill switch</Button>
          <Button variant="primary" disabled>
            Kapalı
          </Button>
          <Button variant="primary" size="sm">
            Küçük
          </Button>
          <Button variant="primary" size="lg">
            Büyük
          </Button>
        </div>
      </Section>

      <Section id="sg-panels" title="Paneller ve durumlar" lead="Her ekran yükleniyor, boş, hata ve izin yok durumlarını gösterir.">
        <div className="grid gap-5 xl:grid-cols-2">
          <Panel raised>
            <PanelHeader code="R07" title="Pozisyon başına üst sınır" meta="Özsermayenin %20'si · limitler v1" />
            <PanelBody>
              <p className="text-ui text-ink-soft">Yükseltilmiş panel: sert gölge, tek odak noktası olan kartlar için.</p>
            </PanelBody>
            <PanelFooter>
              <Button size="sm" variant="outline">
                Geçmiş
              </Button>
            </PanelFooter>
          </Panel>
          <Panel tone="critical">
            <PanelHeader title="Kritik panel" meta="Yalnızca kill switch ve veto bağlamında" />
            <PanelBody>
              <ErrorState message="Sunucu yanıt vermedi. Veriler değişmedi." />
            </PanelBody>
          </Panel>
          <Panel>
            <PanelHeader title="Yükleniyor" />
            <PanelBody>
              <SkeletonLines lines={4} />
            </PanelBody>
          </Panel>
          <Panel tone="paper" className="paper-grain">
            <EmptyState title="Bekleyen onay yok." body="Risk kapısından geçen yeni öneri gelince burada belirir; masa açık." />
          </Panel>
        </div>
      </Section>
    </>
  );
}
