"use client";

import { useMemo, useState } from "react";
import type { Explain, SourceQuote } from "@/lib/domain";
import { routeLabel } from "@/lib/domain";
import { fmtDateTime, fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FixtureBadge, TemsiliBadge, Badge } from "@/components/ui/badge";
import { injectionSpans, quoteSpans, segmentText, type Span } from "./highlight";
import { Ledger, Section } from "./section";

/**
 * §1 Bildirim: the disclosure text in TR/EN with the quoted source spans marked, so the
 * reader sees exactly which words the agents relied on (FR-31). Instruction-like text in a
 * red-team fixture is marked as data, never followed.
 */
function quotesOf(e: Explain): Array<SourceQuote & { source: string }> {
  return [
    ...(e.classifier?.quotes ?? []).map((q) => ({ ...q, source: "Sınıflandırıcı" })),
    ...(e.reader?.quotes ?? []).map((q) => ({ ...q, source: "Okuyucu" })),
  ];
}

const REASON_LABEL = { NEW: "Yeni", UPD: "Güncelleme", CORR: "Düzeltme", CANC: "İptal" } as const;

export function DisclosureSection({ e }: { e: Explain }) {
  const langs = e.texts.map((t) => t.lang);
  const [lang, setLang] = useState<"tr" | "en">("tr");
  const text = e.texts.find((t) => t.lang === lang) ?? e.texts[0];
  const d = e.disclosure;
  const isFixture = d.ingest_source === "demo";

  const { segments, quoteCount, hasInjection } = useMemo(() => {
    if (!text) return { segments: [], quoteCount: 0, hasInjection: false };
    const quotes = quotesOf(e);
    const spans: Span[] =
      text.lang === "tr"
        ? [...e.source_spans.map((s) => ({ start: s.start, end: s.end, fields: [s.field] })), ...quoteSpans(text.body, quotes)]
        : [];
    const inj = injectionSpans(text.body);
    return { segments: segmentText(text.body, [...spans, ...inj]), quoteCount: spans.length, hasInjection: inj.length > 0 };
  }, [e, text]);

  return (
    <Section
      id="bildirim"
      num="1"
      title="Bildirim"
      meta={`KAP idx ${d.disclosure_index} · ${d.disclosure_type} · yayım ${fmtTime(d.published_at)} · panele ${fmtTime(d.available_at, true)}`}
      stamp={
        <>
          {isFixture ? <FixtureBadge /> : null}
          <TemsiliBadge />
        </>
      }
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <div role="group" aria-label="Metin dili" className="inline-flex border-[1.5px] border-ink">
              {(["tr", "en"] as const).map((l, i) => {
                const available = langs.includes(l);
                return (
                  <button
                    key={l}
                    type="button"
                    aria-pressed={lang === l}
                    disabled={!available}
                    title={available ? undefined : "Bu bildirimin İngilizce sürümü yok"}
                    onClick={() => setLang(l)}
                    className={cn(
                      "h-8 min-w-12 px-3 text-dense font-medium",
                      i > 0 && "border-l border-ink",
                      lang === l ? "bg-ink text-on-dark" : "bg-panel text-ink hover:bg-wash-tint",
                      !available && "cursor-not-allowed text-muted opacity-60 hover:bg-panel",
                    )}
                  >
                    {l.toLocaleUpperCase("tr-TR")}
                  </button>
                );
              })}
            </div>
            <p className="text-meta text-muted">
              {lang === "tr"
                ? quoteCount
                  ? `${quoteCount} alıntı işaretli — ajanların dayandığı kelimeler`
                  : "Ajan alıntısı yok"
                : "Alıntılar Türkçe metin üzerinden doğrulanır"}
            </p>
          </div>
          {text ? (
            <div lang={text.lang} className="border-l-[3px] border-ink bg-paper px-4 py-3 text-ui leading-6 whitespace-pre-wrap text-ink">
              {segments.map((s, i) =>
                s.fields ? (
                  s.fields.includes("injection") ? (
                    <mark key={i} className="border-b-2 border-north bg-north-tint px-0.5 text-north" title="Gizli talimat kalıbı — veri olarak gösterilir, uygulanmaz">
                      {s.text}
                    </mark>
                  ) : (
                    <mark key={i} className="border-b-2 border-wash bg-wash-tint-strong px-0.5 text-ink" title={`Alıntı: ${s.fields.join(", ")}`}>
                      {s.text}
                    </mark>
                  )
                ) : (
                  <span key={i}>{s.text}</span>
                ),
              )}
            </div>
          ) : (
            <p className="text-dense text-muted">Metin yok.</p>
          )}
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-meta text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-2.5 w-4 border-b-2 border-wash bg-wash-tint-strong" />
              ajan alıntısı (source span)
            </span>
            {hasInjection ? (
              <span className="inline-flex items-center gap-1.5 text-north">
                <span aria-hidden className="inline-block h-2.5 w-4 border-b-2 border-north bg-north-tint" />
                gizli talimat kalıbı — veri olarak gösterildi, uygulanmadı
              </span>
            ) : null}
          </p>
        </div>
        <Ledger
          className="self-start sm:grid-cols-[96px_1fr]"
          rows={[
            { k: "Şirket", v: <span>{d.company_name}</span> },
            { k: "Hisse", v: <span className="code">{d.stock_codes.join(", ")}</span> },
            { k: "Konu", v: d.subject },
            { k: "Sınıf · neden", v: `${d.disclosure_class} · ${REASON_LABEL[d.reason]}` },
            { k: "Rota", v: <Badge tone="outline">{routeLabel(d.subject_route)}</Badge>, hint: d.subject_map_version },
            { k: "Yayım", v: fmtDateTime(d.published_at) },
            { k: "Kaynak", v: isFixture ? "Demo fikstürü" : d.ingest_source === "live" ? "Canlı akış" : d.ingest_source },
            {
              k: "KAP",
              v: isFixture ? (
                <span className="text-muted">Temsili — bağlantı yok</span>
              ) : (
                <span className="code text-ink-soft" title="Fikstür: gerçek KAP bildirimi değil">
                  Bildirim/{d.disclosure_index} · Temsili
                </span>
              ),
            },
          ]}
        />
      </div>
    </Section>
  );
}
