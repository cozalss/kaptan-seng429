import type { Explain, RiskCheck } from "@/lib/domain";
import { REASON_CODE_ORDER, RISK_GATE_ORDER, RISK_RULES } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { Badge, RuleMark, SeverityBadge } from "@/components/ui/badge";
import { HashChip } from "@/components/ui/data";
import { LlmNote } from "@/components/ui/primitives";
import { CHECK_LABEL, FLAG_LABEL, RISK_OUTCOME_LABEL, trDecimal } from "./labels";
import { DisplayText } from "./display-text";
import { NotRun, Section, ToneBadge } from "./section";

/**
 * §6 Şüpheci · §7 Kural izi · §8 Uyum · §9 Risk kapısı (05, 06 §10, 04 §6.1). The deterministic
 * parts (rule trace, risk gate) are tables of ✓/✗ with the observed value and threshold, so the
 * decision can be re-read line by line.
 */
const MULTS = [1, 0.75, 0.5, 0.25] as const;

export function SkepticSection({ e, pending }: { e: Explain; pending?: string | null }) {
  const sk = e.skeptic;
  return (
    <Section
      id="supheci"
      num="6"
      title="Şüpheci"
      meta="Karşı argüman arar; büyüklüğü küçültebilir ya da veto bayrağı kaldırabilir (eşik 0,60)"
      pending={pending}
      tone={sk?.veto ? "critical" : "panel"}
      stamp={sk ? sk.veto ? <Badge tone="north-solid">VETO</Badge> : <Badge tone={sk.size_multiplier < 1 ? "wash" : "outline"}>×{String(sk.size_multiplier).replace(".", ",")}</Badge> : null}
    >
      {!sk ? (
        <NotRun>Şüpheci bu koşuda çalışmadı.</NotRun>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <div>
            <div className="text-meta text-muted">Büyüklük çarpanı</div>
            <div className={cn("mt-1 font-display text-[48px] leading-none tabular-nums", sk.veto ? "text-north" : "text-ink")}>
              <DisplayText text={`×${String(sk.size_multiplier).replace(".", ",")}`} />
            </div>
            <div role="img" aria-label={`Çarpan ${String(sk.size_multiplier).replace(".", ",")}; olası değerler 1, 0,75, 0,5, 0,25`} className="mt-3 grid grid-cols-4 border-[1.5px] border-ink">
              {MULTS.map((m, i) => (
                <span key={m} className={cn("grid h-8 place-items-center text-dense tabular-nums", i > 0 && "border-l border-ink", m === sk.size_multiplier ? (sk.veto ? "bg-north text-on-dark" : "bg-ink text-on-dark") : "text-muted")}>
                  ×{String(m).replace(".", ",")}
                </span>
              ))}
            </div>
            <p className="mt-2 text-meta text-muted">{sk.veto ? "Veto: kural motoru SKEPTIC_VETO okur." : sk.size_multiplier < 1 ? "Pozisyon büyüklüğü bu oranda küçültüldü." : "Küçültme yok."}</p>
          </div>
          <div className="min-w-0 space-y-4">
            <div className="border-l-[3px] border-ink bg-paper px-4 py-3">
              <div className="mb-1 flex items-center justify-between gap-3">
                <h3 className="text-dense font-medium text-ink">En güçlü karşı argüman</h3>
                <LlmNote />
              </div>
              <p className="font-display text-[22px] leading-snug text-ink">“<DisplayText text={sk.strongest_counterargument_tr} />”</p>
            </div>
            {sk.flags.length ? (
              <ul className="divide-y divide-hairline border-y border-hairline" aria-label="Şüpheci bayrakları">
                {sk.flags.map((f) => (
                  <li key={`${f.code}-${f.detail_tr}`} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2">
                    <SeverityBadge severity={f.severity} />
                    <span className="code text-ink-soft">{f.code}</span>
                    <span className="text-dense text-ink">{FLAG_LABEL[f.code]}</span>
                    <span className="w-full text-dense text-ink-soft">{f.detail_tr}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-dense text-muted">Bayrak yok.</p>
            )}
          </div>
        </div>
      )}
    </Section>
  );
}

function reasonRank(code: string): number {
  const generic = code.replace(/^E\d_/, "E_");
  const i = (REASON_CODE_ORDER as readonly string[]).indexOf(generic);
  return i < 0 ? 99 : i;
}

export function RuleTraceSection({ e, pending }: { e: Explain; pending?: string | null }) {
  const rd = e.rule_decision;
  return (
    <Section
      id="kural"
      num="7"
      title="Kural izi"
      meta="Deterministik kural motoru (rules-v1.0, ön kayıtlı); LLM karar vermez"
      pending={pending}
      stamp={rd ? <ToneBadge tone={rd.outcome === "PROPOSE" ? "ink" : rd.outcome === "HOLD" ? "muted" : "outline"}>{rd.outcome}</ToneBadge> : null}
      actions={rd ? <HashChip hash={rd.rules_hash} label="rules_hash" /> : null}
    >
      {!rd ? (
        <NotRun>
          {e.run.outcome === "QUARANTINED"
            ? "Kural motoruna ulaşmadı: metin karantinada kaldı."
            : e.run.outcome === "PREGATE_VETO"
              ? "Kural motoruna ulaşmadı: ön elemede sert veto."
              : "Kural motoru çalışmadı."}
        </NotRun>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-meta text-muted">Gerekçe kodları (tüketim sırası):</span>
            {[...rd.reason_codes].sort((a, b) => reasonRank(a) - reasonRank(b)).map((c) => (
              <Badge key={c} tone={/VETO|NOT_MET|SKIP/.test(c) ? "outline" : "ink"} className="code">
                {c}
              </Badge>
            ))}
          </div>
          {rd.trace.length ? (
            <div className="overflow-x-auto border-[1.5px] border-ink">
              <table className="w-full min-w-[620px] border-collapse text-dense">
                <caption className="sr-only">Kural izi: her kural için gözlenen değer, eşik ve sonuç</caption>
                <thead>
                  <tr className="border-b-[1.5px] border-ink bg-sunk text-left text-meta text-ink-soft">
                    <th scope="col" className="h-9 w-14 px-3 font-medium">Sonuç</th>
                    <th scope="col" className="px-3 font-medium">Kural</th>
                    <th scope="col" className="px-3 text-right font-medium">Gözlenen</th>
                    <th scope="col" className="px-3 font-medium">Eşik</th>
                    <th scope="col" className="px-3 font-medium">Açıklama</th>
                  </tr>
                </thead>
                <tbody>
                  {rd.trace.map((t) => (
                    <tr key={t.rule} className={cn("border-b border-hairline", !t.passed && "bg-sunk")}>
                      <td className="h-10 px-3">
                        <RuleMark passed={t.passed} />
                      </td>
                      <td className="px-3">
                        <span className="code text-ink">{t.rule}</span>
                      </td>
                      <td className="px-3 text-right font-medium tabular-nums">{t.observed ?? "—"}</td>
                      <td className="px-3 text-ink-soft">{t.threshold ?? "—"}</td>
                      <td className="px-3 text-ink-soft">{t.detail_tr}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      )}
    </Section>
  );
}

export function ComplianceSection({ e, pending }: { e: Explain; pending?: string | null }) {
  const c = e.compliance;
  const tone = c?.decision === "veto" ? "north" : c?.decision === "escalate" ? "wash" : "outline";
  return (
    <Section
      id="uyum"
      num="8"
      title="Uyum"
      meta={c ? `Mevzuat dayanağı: ${c.regulation_refs.join(" · ")}` : "SPK / VBTS tedbiri, kamuya açıklık, piyasa bozucu eylem, injection"}
      pending={pending}
      tone={c?.decision === "veto" ? "critical" : "panel"}
      stamp={c ? <ToneBadge tone={tone}>{c.decision === "veto" ? "RET" : c.decision === "escalate" ? "İnsan incelemesi (escalate)" : "Geçti"}</ToneBadge> : null}
    >
      {!c ? (
        <NotRun>{e.run.outcome === "PREGATE_VETO" ? "Ön elemede durdu; uyum ajanı çalışmadı." : "Uyum ajanı bu koşuda çalışmadı."}</NotRun>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="max-w-[70ch] text-ui text-ink">{c.summary_tr}</p>
            <LlmNote />
          </div>
          <ul className="grid border-t border-hairline sm:grid-cols-2" aria-label="Uyum kontrolleri">
            {c.checks.map((k) => {
              const bad = k.result === "fail";
              return (
                <li key={k.code} className="flex items-start gap-3 border-b border-hairline py-2 sm:odd:pr-4 sm:even:border-l sm:even:pl-4">
                  <RuleMark passed={k.result === "pass"} critical={bad} />
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-x-2 text-dense">
                      <span className={cn("font-medium", bad ? "text-north" : "text-ink")}>{CHECK_LABEL[k.code]}</span>
                      <span className="code text-muted">{k.code}</span>
                      {k.result === "escalate" || k.result === "unknown" ? <Badge tone="wash">{k.result}</Badge> : null}
                    </p>
                    <p className="text-meta text-ink-soft">
                      {k.detail_tr}
                      {k.basis_ref ? <span className="code ml-1 text-muted">· {k.basis_ref}</span> : null}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Section>
  );
}

function orderOf(r: RiskCheck): number {
  const i = RISK_GATE_ORDER.indexOf(r.rule_code);
  return i < 0 ? 99 : i;
}

export function RiskGateSection({ e, pending }: { e: Explain; pending?: string | null }) {
  const checks = [...e.risk_checks].sort((a, b) => (a.phase === b.phase ? orderOf(a) - orderOf(b) : a.phase === "pre_trade" ? -1 : 1));
  const passed = checks.filter((c) => c.outcome === "pass").length;
  const rejected = checks.some((c) => c.outcome === "reject");
  return (
    <Section
      id="risk"
      num="9"
      title="Risk kapısı R01–R16"
      meta="Çalışma sırası R01 → R02 → R03 → R04 → R13 → R11 → R14 → R05 → R06 → R09 → R12 → R07 → R08 → R10 → R15; R16 gönderim anında"
      pending={pending}
      tone={rejected ? "critical" : "panel"}
      stamp={checks.length ? <Badge tone={rejected ? "north-solid" : "outline"}>{rejected ? "Ret" : `${passed} geçti · ${checks.length - passed} işaret`}</Badge> : null}
    >
      {checks.length === 0 ? (
        <NotRun>
          {e.run.outcome === "PREGATE_VETO"
            ? "Risk kapısının R03 / R04 / R13 kontrolleri ön elemede LLM'den önce çalıştı ve veto etti (§2)."
            : "Öneri üretilmediği için risk kapısına ulaşılmadı."}
        </NotRun>
      ) : (
        <div className="overflow-x-auto border-[1.5px] border-ink">
          <table className="w-full min-w-[680px] border-collapse text-dense">
            <caption className="sr-only">Risk kapısı kuralları çalışma sırasıyla: sonuç, gözlenen değer, limit</caption>
            <thead>
              <tr className="border-b-[1.5px] border-ink bg-sunk text-left text-meta text-ink-soft">
                <th scope="col" className="h-9 w-10 px-3 text-right font-medium">#</th>
                <th scope="col" className="px-3 font-medium">Kural</th>
                <th scope="col" className="px-3 font-medium">Sonuç</th>
                <th scope="col" className="px-3 text-right font-medium">Gözlenen</th>
                <th scope="col" className="px-3 text-right font-medium">Limit</th>
                <th scope="col" className="px-3 font-medium">Ayrıntı</th>
              </tr>
            </thead>
            <tbody>
              {checks.map((r, i) => {
                const o = RISK_OUTCOME_LABEL[r.outcome];
                return (
                  <tr key={`${r.phase}-${r.rule_code}`} className={cn("border-b border-hairline", r.phase === "at_send" && "border-t-[1.5px] border-t-ink")}>
                    <td className="h-10 px-3 text-right text-muted tabular-nums">{i + 1}</td>
                    <td className="px-3 whitespace-nowrap">
                      <span className="code mr-2 font-medium text-ink">{r.rule_code}</span>
                      <span className="text-ink">{RISK_RULES[r.rule_code].label_tr}</span>
                      {r.phase === "at_send" ? <span className="ml-2 text-meta text-muted">gönderimde</span> : null}
                    </td>
                    <td className="px-3">
                      {r.outcome === "pass" ? <RuleMark passed label={<span className="text-dense">{o.tr}</span>} /> : <ToneBadge tone={o.tone}>{o.tr}</ToneBadge>}
                    </td>
                    <td className="px-3 text-right font-medium tabular-nums">{r.observed ? trDecimal(r.observed) : "—"}</td>
                    <td className="px-3 text-right text-ink-soft tabular-nums">{r.limit ? trDecimal(r.limit) : "—"}</td>
                    <td className="px-3 text-ink-soft">{r.detail_tr}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}
