import type { Explain } from "@/lib/domain";
import { GUARD_QUARANTINE, GUARD_SOFT, RISK_RULES, routeLabel } from "@/lib/domain";
import { Badge, RuleMark } from "@/components/ui/badge";
import { fmtScore, riskCodeOf, splitReason } from "./labels";
import { Ledger, Meter, NotRun, Section } from "./section";

/**
 * §2 Ön eleme ve koruma (05 §5.0, US-03, FR-22): the LLM-free route, the pre-gate (R03/R04/R13)
 * and the Prompt Guard. A hard veto here means zero LLM calls; a quarantine means the text
 * never reaches the rule engine (11 Adım 3).
 */
export function PreGateSection({ e, pending }: { e: Explain; pending?: string | null }) {
  const pg = e.pre_gate;
  const g = e.guard;
  const veto = pg ? !pg.passed : false;
  const quarantined = g?.quarantined ?? false;
  const critical = veto || quarantined;
  return (
    <Section
      id="on-eleme"
      num="2"
      title="Ön eleme ve koruma"
      meta="LLM'siz yönlendirme, tedbir / evren / engel listesi ön kontrolü ve Prompt Guard"
      tone={critical ? "critical" : "panel"}
      pending={pending}
      stamp={
        veto ? (
          <Badge tone="north-solid">SERT VETO · LLM çağrısı {e.run.llm_calls}</Badge>
        ) : quarantined ? (
          <Badge tone="north-solid">KARANTİNA</Badge>
        ) : pg ? (
          <Badge tone="outline">Geçti</Badge>
        ) : null
      }
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="min-w-0 space-y-4">
          <h3 className="text-dense font-medium text-ink">Yönlendirme ve ön eleme</h3>
          {e.route ? (
            <Ledger
              rows={[
                { k: "Konu haritası", v: routeLabel(e.disclosure.subject_route), hint: e.route.table_version },
                { k: "Alt tür ipucu", v: e.route.sub_type_hint ? <span className="code">{e.route.sub_type_hint}</span> : "—" },
              ]}
            />
          ) : null}
          {pg ? (
            <ul className="space-y-2" aria-label="Ön eleme sonuçları">
              {pg.reasons.map((r) => {
                const s = splitReason(r);
                const rc = riskCodeOf(s.code);
                const isVetoLine = !pg.passed && Boolean(s.code);
                const passLine = /✓/.test(r);
                return (
                  <li key={r} className={isVetoLine ? "border-l-[3px] border-north bg-north-tint px-3 py-2" : "flex items-start gap-2"}>
                    {isVetoLine ? (
                      <>
                        <p className="flex flex-wrap items-center gap-2 text-dense font-medium text-north">
                          <span className="code">{rc ?? s.code}</span>
                          {rc ? <span>{RISK_RULES[rc as keyof typeof RISK_RULES]?.label_tr}</span> : null}
                          <Badge tone="north-solid">sert veto</Badge>
                        </p>
                        <p className="mt-1 text-dense text-ink">{s.text}</p>
                      </>
                    ) : pg.passed || passLine ? (
                      <RuleMark passed label={<span className="text-dense text-ink-soft">{r.replace(/\s*✓$/, "")}</span>} />
                    ) : (
                      <span className="pl-1 text-dense text-ink-soft">— {r}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <NotRun>Ön eleme kaydı yok.</NotRun>
          )}
        </div>

        <div className="min-w-0 space-y-4">
          <h3 className="text-dense font-medium text-ink">Prompt Guard ve TR regex</h3>
          {g ? (
            <>
              <div>
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <span className="text-meta text-muted">Injection skoru</span>
                  <span className={`font-display text-[28px] leading-none tabular-nums ${quarantined ? "text-north" : "text-ink"}`}>{fmtScore(g.injection_score)}</span>
                </div>
                <Meter
                  value={g.injection_score}
                  label={`Prompt Guard injection skoru ${fmtScore(g.injection_score)}`}
                  tone={quarantined ? "north" : "ink"}
                  marks={[
                    { at: GUARD_SOFT, label: "0,50 yumuşak" },
                    { at: GUARD_QUARANTINE, label: "0,90 karantina" },
                  ]}
                />
              </div>
              <Ledger
                rows={[
                  { k: "Karar", v: quarantined ? <span className="font-medium text-north">Karantina — kural motoruna ulaşmadı</span> : g.injection_score >= GUARD_SOFT ? "Yumuşak uyarı: uyum en az escalate" : "Temiz" },
                  { k: "Puanlanan parça", v: String(g.chunks_scored) },
                  { k: "Maskelenen ad (KVKK)", v: String(g.masked_names_n), hint: g.masked_names_n ? "KİŞİ_n olarak gösterilir" : undefined },
                  {
                    k: "Regex eşleşmesi",
                    v: g.regex_hits.length ? (
                      <ul className="space-y-1">
                        {g.regex_hits.map((h) => (
                          <li key={h} className="text-north">
                            {h}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      "yok"
                    ),
                  },
                ]}
              />
            </>
          ) : (
            <NotRun>{veto ? "Ön elemede durduğu için koruma ve ajanlar çalışmadı (LLM çağrısı 0)." : "Koruma kaydı yok."}</NotRun>
          )}
        </div>
      </div>
    </Section>
  );
}
