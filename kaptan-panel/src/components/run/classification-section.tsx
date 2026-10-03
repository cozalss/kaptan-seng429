import type { Explain } from "@/lib/domain";
import { CLASSIFIER_MIN_CONFIDENCE, EVENT_LABEL } from "@/lib/domain";
import { Badge, EventBadge } from "@/components/ui/badge";
import { LlmNote } from "@/components/ui/primitives";
import { fmtScore } from "./labels";
import { Ledger, Meter, NotRun, Section } from "./section";

/**
 * §3 Sınıflandırma (05 ClassifierOutput): which method decided the event type — the
 * LLM-free subject map or the classifier — with confidence against the 0,80 threshold,
 * rationale (LLM text, labelled) and the verbatim quotes.
 */
const DIRECTION = { positive: "olumlu", negative: "olumsuz", neutral: "nötr", unknown: "bilinmiyor" } as const;

export function ClassificationSection({ e, pending }: { e: Explain; pending?: string | null }) {
  const c = e.classifier;
  const cls = e.disclosure.classification;
  const method = cls?.method ?? null;
  const node = e.trace.nodes.find((n) => n.node === "classifier");
  return (
    <Section
      id="siniflandirma"
      num="3"
      title="Sınıflandırma"
      meta={
        method === "subject_map"
          ? "Yöntem: KAP konu haritası (LLM'siz); Sınıflandırıcı doğrulama için atlandı"
          : method === "llm"
            ? "Yöntem: Sınıflandırıcı ajan (LLM) — konu alanı olayı tek başına tiplemedi"
            : "Yöntem: —"
      }
      pending={pending}
      stamp={cls ? <EventBadge type={cls.event_type} /> : null}
    >
      {!c && !cls ? (
        <NotRun>
          {e.run.outcome === "PREGATE_VETO"
            ? "Ön elemede durdu; sınıflandırma yapılmadı."
            : e.run.outcome === "QUARANTINED"
              ? "Karantinadaki metin sınıflandırıcıya gönderilmedi."
              : "Sınıflandırma kaydı yok."}
        </NotRun>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-4">
            {cls ? (
              <div>
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <span className="text-meta text-muted">Güven</span>
                  <span className="font-display text-[28px] leading-none tabular-nums text-ink">{fmtScore(cls.confidence)}</span>
                </div>
                <Meter
                  value={cls.confidence}
                  threshold={CLASSIFIER_MIN_CONFIDENCE}
                  label={`Sınıflandırma güveni ${fmtScore(cls.confidence)}, eşik 0,80`}
                  tone={cls.confidence >= CLASSIFIER_MIN_CONFIDENCE ? "ink" : "wash"}
                />
              </div>
            ) : null}
            <Ledger
              rows={[
                cls && { k: "Olay", v: `${EVENT_LABEL[cls.event_type].code} · ${EVENT_LABEL[cls.event_type].tr}` },
                c && { k: "Alt tür", v: <span className="code">{c.sub_type}</span> },
                c && { k: "Yön", v: DIRECTION[c.direction] },
                c && { k: "Düzeltme / güncelleme", v: c.is_correction_or_update ? "evet" : "hayır" },
                c && { k: "Injection şüphesi", v: c.injection_suspected ? <span className="text-north">evet</span> : "hayır" },
                c && { k: "Durum", v: c.status === "ok" ? "ok" : <Badge tone="muted">çekimser · {c.abstain?.reason ?? "—"}</Badge>, hint: c.abstain?.detail_tr },
                node?.model_id ? { k: "Model", v: <span className="code">{node.model_id}</span>, hint: node.prompt_version ?? undefined } : null,
              ]}
            />
          </div>
          <div className="min-w-0 space-y-3">
            {c ? (
              <>
                <div>
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <h3 className="text-dense font-medium text-ink">Gerekçe</h3>
                    {method === "llm" ? <LlmNote /> : <span className="text-meta text-muted">kural tabanlı · konu haritası</span>}
                  </div>
                  <p className="text-ui text-ink-soft">{c.rationale_tr}</p>
                </div>
                <div>
                  <h3 className="mb-1 text-dense font-medium text-ink">Alıntılar ({c.quotes.length})</h3>
                  <ul className="space-y-2">
                    {c.quotes.map((q) => (
                      <li key={`${q.field}-${q.quote}`} className="border-l-[3px] border-wash bg-wash-tint px-3 py-2">
                        <span className="code mr-2 text-muted">{q.field}</span>
                        <q className="text-dense text-ink">{q.quote}</q>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            ) : (
              <NotRun>Konu haritası olayı LLM’siz tipledi; Sınıflandırıcı çıktısı yok.</NotRun>
            )}
          </div>
        </div>
      )}
    </Section>
  );
}
