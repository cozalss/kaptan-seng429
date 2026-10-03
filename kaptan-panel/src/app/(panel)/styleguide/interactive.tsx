"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Field, Input, RequiredComment, validateComment } from "@/components/ui/field";
import { Dialog, DialogContent, DialogTrigger, DrawerContent, Tabs, TabsContent, TabsList, TabsTrigger, Tooltip } from "@/components/ui/overlay";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Countdown, HashChip, Sparkline } from "@/components/ui/data";
import { DataTable, type Column } from "@/components/ui/table";
import { EventBadge, TemsiliBadge } from "@/components/ui/badge";
import { notify } from "@/components/ui/toast";
import { fmtPrice, fmtSignedPct } from "@/lib/format";
import type { EventType } from "@/lib/domain";

interface Row {
  id: string;
  time: string;
  ticker: string;
  type: EventType;
  car: number;
}

/** Fictional sample rows (Temsili) — styleguide only. */
const ROWS: Row[] = [
  { id: "r1", time: "10:12", ticker: "ORNEK", type: "E3", car: 0.014 },
  { id: "r2", time: "11:47", ticker: "DMOGD", type: "E1", car: 0.006 },
  { id: "r3", time: "12:05", ticker: "TMSPZ", type: "E4", car: -0.003 },
  { id: "r4", time: "13:22", ticker: "KRGCL", type: "E2", car: 0.009 },
];

const COLUMNS: Column<Row>[] = [
  { key: "time", header: "Saat", cell: (r) => <span className="tabular-nums">{r.time}</span>, sortValue: (r) => r.time },
  { key: "ticker", header: "Kod", cell: (r) => <span className="code">{r.ticker}</span>, sortValue: (r) => r.ticker },
  { key: "type", header: "Olay", cell: (r) => <EventBadge type={r.type} compact /> },
  {
    key: "car",
    header: "Ort. CAR (5g)",
    align: "right",
    cell: (r) => <span className="tabular-nums">{fmtSignedPct(r.car)}</span>,
    sortValue: (r) => r.car,
  },
];

const SPARK = [0, 0.002, 0.001, 0.004, 0.003, 0.006, 0.005, 0.009, 0.008, 0.012];
/** Next-session approval expiry on the demo day (12.01.2027 09:50 Istanbul), counted on the mock clock. */
const EXPIRY = "2027-01-12T06:50:00.000Z";

export function StyleguideInteractive() {
  const [comment, setComment] = useState("");
  const [touched, setTouched] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <section aria-labelledby="sg-interactive" className="grid gap-5 border-t-[1.5px] border-ink pt-6 lg:grid-cols-[220px_minmax(0,1fr)]">
      <div>
        <h2 id="sg-interactive" className="font-display text-[26px] leading-tight text-ink">
          Etkileşim
        </h2>
        <p className="mt-1.5 text-dense text-muted">Klavye ile tamamen kullanılabilir; odak her zaman görünür.</p>
      </div>
      <div className="min-w-0 space-y-6">
        <div className="grid gap-5 xl:grid-cols-2">
          <Panel>
            <PanelHeader title="Form" meta="Zorunlu yorum, sayaç ve hata" />
            <div className="space-y-4 p-4">
              <Field label="Tutar (TL)" hint="Küçültme yalnızca aşağı yönlü olabilir.">
                {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} inputMode="numeric" defaultValue="59.916" />}
              </Field>
              <RequiredComment
                value={comment}
                onChange={(v) => {
                  setComment(v);
                  setTouched(true);
                }}
                error={touched ? validateComment(comment) : null}
              />
            </div>
          </Panel>
          <Panel>
            <PanelHeader title="Veri parçaları" meta="Geri sayım, hash, mini grafik" />
            <div className="space-y-4 p-4">
              <Countdown to={EXPIRY} label="Onay süresi" />
              <div className="flex flex-wrap items-center gap-2">
                <HashChip hash="9f2c4b7e0a1d3c5f6e8b9a0c1d2e3f405162738495a6b7c8d9e0f1a2b3c4e41a" label="hash" />
                <TemsiliBadge />
              </div>
              <div className="flex items-center gap-3">
                <Sparkline values={SPARK} baseline={0} tone="wash" width={180} height={40} label="Örnek getiri eğrisi" />
                <span className="text-meta text-muted">örnek değer · gerçek sonuç değil</span>
              </div>
              <p className="text-dense text-ink-soft">
                Referans fiyat <span className="tabular-nums text-ink">{fmtPrice(47.4)}</span>
              </p>
            </div>
          </Panel>
        </div>

        <Panel>
          <PanelHeader title="Tablo" meta="Sıralanabilir sütunlar, klavye ile satır seçimi · Temsili" />
          <DataTable
            caption="Örnek bildirim tablosu"
            columns={COLUMNS}
            rows={ROWS}
            getRowId={(r) => r.id}
            initialSort={{ key: "time", dir: "asc" }}
            onRowClick={(r) => notify.info(`${r.ticker} seçildi`, "Örnek satır; gerçek veri değil.")}
          />
        </Panel>

        <Tabs defaultValue="tr">
          <TabsList aria-label="Metin dili">
            <TabsTrigger value="tr">Türkçe</TabsTrigger>
            <TabsTrigger value="en">English</TabsTrigger>
          </TabsList>
          <TabsContent value="tr" className="pt-3 text-ui text-ink-soft">
            Şirketimiz ile ÖRNEK ALTYAPI A.Ş. arasında 58.400.000 TL tutarlı sözleşme imzalanmıştır. (Temsili)
          </TabsContent>
          <TabsContent value="en" className="pt-3 text-ui text-ink-soft">
            A contract worth TRY 58,400,000 was signed with ÖRNEK ALTYAPI A.Ş. (Representative)
          </TabsContent>
        </Tabs>

        <div className="flex flex-wrap items-center gap-3">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">Diyalog</Button>
            </DialogTrigger>
            <DialogContent title="Öneriyi küçült" description="Yeni tutar öneriden büyük olamaz.">
              <p className="text-ui text-ink-soft">Diyalog içeriği. Esc ile kapanır, odak tetikleyiciye döner.</p>
            </DialogContent>
          </Dialog>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">Çekmece</Button>
            </DialogTrigger>
            <DrawerContent title="ORNEK · 10:12" description="Bildirim ayrıntısı (Temsili)">
              <p className="text-ui text-ink-soft">Satır çekmecesi: metin, ön eleme, sınıflandırma, not.</p>
            </DrawerContent>
          </Dialog>
          <Button variant="danger" onClick={() => setConfirmOpen(true)}>
            Kill switch (örnek)
          </Button>
          <Tooltip content="Ipucu: mürekkep zemin, kâğıt yazı.">
            <Button variant="ghost">İpucu</Button>
          </Tooltip>
          <Button variant="secondary" onClick={() => notify.success("Onay kaydedildi", "Audit #4813 · örnek")}>
            Bildirim
          </Button>
          <Button variant="ghost" onClick={() => notify.error("İşlem reddedildi", "Kill switch açıkken onay verilemez.")}>
            Hata bildirimi
          </Button>
        </div>

        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Tüm işlemleri durdur"
          description="Stil rehberi örneği. Hiçbir şey değişmez."
          phrase="DURDUR"
          confirmLabel="Durdur"
          requireComment
          requireTotp
          onConfirm={() => {
            setConfirmOpen(false);
            notify.info("Örnek onay", "Stil rehberinde hiçbir şey durdurulmadı.");
          }}
        />
      </div>
    </section>
  );
}
