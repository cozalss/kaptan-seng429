import type { Explain, ReaderOutput } from "@/lib/domain";
import { fmtDate, fmtInt, fmtPct, fmtTry } from "@/lib/format";
import { Badge, RuleMark } from "@/components/ui/badge";
import { LlmNote, Numeral } from "@/components/ui/primitives";
import { BINDING_LABEL, DENOMINATOR_LABEL, fmtScore } from "./labels";
import { mergeCalc, regexMatch } from "./merge-math";
import { Ledger, NotRun, Section } from "./section";

/**
 * §4 Okuyucu · Önemlilik · Birleştirme (05 §5.0). The LLMs fetch numbers, never ratios:
 * the Birleştirme node checks the Okuyucu amount against the regex amounts in the text
 * (R14) and divides by the Önemlilik denominator with Decimal. Shown as an equation.
 */
const yesNo = (b: boolean | null | undefined) => (b === null || b === undefined ? "—" : b ? "evet" : "hayır");

function readerRows(r: ReaderOutput) {
  switch (r.kind) {
    case "E3":
      return [
        { k: "Konu", v: r.subject_tr },
        { k: "Bağlayıcılık", v: BINDING_LABEL[r.binding_status] ?? r.binding_status },
        { k: "Karşı taraf", v: `${r.counterparty_role === "customer" ? "müşteri" : r.counterparty_role}${r.counterparty_public_sector ? " · kamu" : ""}${r.counterparty_disclosed ? "" : " · ad açıklanmadı"}` },
        { k: "İlişkili taraf", v: yesNo(r.related_party) },
        { k: "Yenileme / uzatma", v: yesNo(r.is_renewal_or_extension) },
        { k: "Süre · başlangıç", v: `${r.duration_months ?? "—"} ay · ${r.start_date ? fmtDate(`${r.start_date}T09:00:00Z`) : "—"}` },
        { k: "KDV", v: r.vat === "excluded" ? "hariç" : r.vat === "included" ? "dahil" : "bilinmiyor" },
      ];
    case "E1":
      return [
        { k: "Nitelik", v: r.nature === "execution" ? "gerçekleşen alım" : r.nature === "program_announcement" ? "program duyurusu" : r.nature },
        { k: "Program içinde", v: yesNo(r.in_programme) },
        { k: "İşlem satırı", v: String(r.transactions.length) },
        { k: "Kümülatif sermaye payı", v: r.cumulative_capital_pct !== null ? fmtPct(r.cumulative_capital_pct, 2) : "—" },
        { k: "Pazar", v: r.venue ?? "—" },
      ];
    case "E2":
      return [
        { k: "Kişi / kurum", v: <span className="code">{r.person_or_entity}</span>, hint: "KVKK maskeli" },
        { k: "Rol", v: r.role.replace(/_/g, " ") },
        { k: "Yön", v: r.direction === "buy" ? "alım" : r.direction === "sell" ? "satım" : "karışık" },
        { k: "Borsada", v: yesNo(r.open_market) },
        { k: "Pay (önce → sonra)", v: r.holding_before_pct !== null && r.holding_after_pct !== null ? `%${String(r.holding_before_pct).replace(".", ",")} → %${String(r.holding_after_pct).replace(".", ",")}` : "—" },
      ];
    case "E4":
      return [
        { k: "Dönem", v: r.period },
        { k: "Rapor", v: r.report_kind },
        { k: "TMS 29", v: yesNo(r.tms29_applied) },
        { k: "Denetim görüşü", v: r.audit_opinion ?? "—" },
        { k: "Yönetim tonu", v: r.management_tone },
        { k: "Tek seferlik", v: r.one_off_items.join(", ") || "—" },
      ];
  }
}

function Equation({ e }: { e: Explain }) {
  const calc = mergeCalc(e);
  if (!calc) return null;
  const den = DENOMINATOR_LABEL[calc.denominatorKind] ?? calc.denominatorKind;
  return (
    <figure className="border-[1.5px] border-ink bg-paper">
      <figcaption className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-4 py-2 text-meta text-muted">
        <span>Birleştirme hesabı · Decimal · kod</span>
        {calc.matches ? <RuleMark passed label={<span className="text-meta text-ink-soft">panelde yeniden hesaplandı, aynı</span>} /> : <Badge tone="north">yeniden hesap farklı</Badge>}
      </figcaption>
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3 px-4 py-4">
        <div className="min-w-0">
          <div className="text-meta text-muted">Tutar (Okuyucu)</div>
          <div className="font-display text-[24px] leading-none tabular-nums text-ink">{fmtTry(calc.amount)}</div>
        </div>
        {calc.annualFactor !== 1 ? (
          <div aria-label={`yıllıklandırma çarpanı 12 / ${calc.months}`} className="pb-0.5 text-ui text-ink-soft">
            × 12/{calc.months} ay
          </div>
        ) : null}
        <div aria-hidden className="pb-1 font-sans text-[24px] leading-none font-light text-muted">
          ÷
        </div>
        <div className="min-w-0">
          <div className="text-meta text-muted">{den} (Önemlilik)</div>
          <div className="font-display text-[24px] leading-none tabular-nums text-ink">{fmtTry(calc.denominator)}</div>
        </div>
        <div aria-hidden className="pb-1 font-sans text-[24px] leading-none font-light text-muted">
          =
        </div>
        <div>
          <div className="text-meta text-muted">Oran</div>
          <div className="font-display text-[40px] leading-none tabular-nums text-ink">
            <Numeral text={fmtPct(calc.reported ?? calc.recomputed, 1)} />
          </div>
        </div>
      </div>
      <p className="border-t border-hairline px-4 py-2 text-meta text-muted">
        Payda kaynağı <span className="code">{calc.denominatorRef}</span>
        {calc.months ? ` · sözleşme süresi ${calc.months} ay` : ""}
      </p>
    </figure>
  );
}

export function MergeSection({ e, pending }: { e: Explain; pending?: string | null }) {
  const m = e.merged;
  const mat = e.materiality;
  const r = e.reader;
  const rx = m ? regexMatch(m.reader_amount, m.regex_amounts) : null;
  if (!m && !r && !mat) {
    return (
      <Section id="birlestirme" num="4" title="Okuyucu · Önemlilik · Birleştirme" meta="Sayıları LLM getirir, oranı kod hesaplar" pending={pending}>
        <NotRun>
          {e.run.outcome === "PREGATE_VETO" || e.run.outcome === "QUARANTINED"
            ? "Bu düğümler çalışmadı."
            : e.run.outcome === "HOLD"
              ? "Sınıflandırma güveni eşik altında kaldığı için ayrıntı çıkarımı karara girmedi (HOLD)."
              : "Bu koşuda Birleştirme kaydı yok."}
        </NotRun>
      </Section>
    );
  }
  return (
    <Section
      id="birlestirme"
      num="4"
      title="Okuyucu · Önemlilik · Birleştirme"
      meta="Okuyucu, Önemlilik ve Kanıt paralel çalıştı; sayıları LLM getirir, oranı kod hesaplar"
      pending={pending}
      stamp={m?.amount_in_text === false ? <Badge tone="north">Tutar metinde yok ✗</Badge> : m?.amount_in_text ? <Badge tone="outline">Tutar metinde doğrulandı ✓</Badge> : null}
    >
      <div className="space-y-5">
        <Equation e={e} />
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="min-w-0">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="text-dense font-medium text-ink">Tutar kontrolü (R14)</h3>
              <span className="text-meta text-muted">tolerans ±%0,5</span>
            </div>
            {m ? (
              <Ledger
                rows={[
                  { k: "Okuyucu tutarı", v: m.reader_amount !== null ? fmtTry(m.reader_amount) : "—", hint: r?.kind === "E3" && r.amount_raw ? `“${r.amount_raw}”` : undefined },
                  {
                    k: "Metindeki regex tutarları",
                    v: m.regex_amounts.length ? (
                      <span className="flex flex-wrap gap-1.5">
                        {m.regex_amounts.map((a) => (
                          <span key={a} className={`code border px-1 ${rx?.matched === a ? "border-ink bg-panel" : "border-hairline text-muted"}`}>
                            {fmtInt(a)}
                          </span>
                        ))}
                      </span>
                    ) : (
                      "bulunamadı"
                    ),
                  },
                  { k: "Eşleşme", v: <RuleMark passed={Boolean(m.amount_in_text)} critical={m.amount_in_text === false} label={<span className="text-dense">{m.amount_in_text ? "tutar metinde doğrulandı" : "eşleşme yok → R14"}</span>} /> },
                  { k: "Payda türü", v: m.e3_denominator ? DENOMINATOR_LABEL[m.e3_denominator] : mat ? DENOMINATOR_LABEL[mat.denominator_kind] : "—" },
                  mat && { k: "Dönem", v: mat.financials_period_end ? fmtDate(`${mat.financials_period_end}T09:00:00Z`) : "—", hint: mat.financials_stale_days !== null ? `${mat.financials_stale_days} gün önce` : undefined },
                  mat && { k: "Kur", v: mat.fx_rates.length ? mat.fx_rates.map((f) => `${f.name} ${String(f.value).replace(".", ",")}`).join(" · ") : "TRY — kur çevrimi gerekmedi" },
                  mat?.market_cap && { k: "Piyasa değeri", v: fmtTry(mat.market_cap.value), hint: mat.market_cap.ref_id },
                  m.leakage_5d_mkt_adj !== null && { k: "Sızıntı (5 seans, piyasa düz.)", v: fmtPct(m.leakage_5d_mkt_adj, 1), hint: "eşik %8" },
                ]}
              />
            ) : (
              <NotRun>Birleştirme kaydı yok.</NotRun>
            )}
          </div>
          <div className="min-w-0">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="text-dense font-medium text-ink">Okuyucu çıkarımı {r ? <span className="code text-muted">{r.kind}</span> : null}</h3>
              {r ? <span className="text-meta text-muted">güven {fmtScore(r.confidence)} · eşik 0,75</span> : null}
            </div>
            {r ? <Ledger rows={readerRows(r)} /> : <NotRun>Okuyucu çıktısı yok.</NotRun>}
            {mat?.notes_tr ? (
              <div className="mt-3 border-l-[3px] border-hairline pl-3">
                <p className="text-dense text-ink-soft">{mat.notes_tr}</p>
                <LlmNote className="mt-1" />
              </div>
            ) : null}
            {mat?.data_gaps.length ? <p className="mt-2 text-meta text-north">Veri boşluğu: {mat.data_gaps.join(", ")}</p> : null}
          </div>
        </div>
      </div>
    </Section>
  );
}
