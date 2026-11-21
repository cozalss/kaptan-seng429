"use client";

import type { ImportPreview, ImportRow, TypeChoice } from "@/lib/domain/imports";
import { fmtInt } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { ImportField } from "./import-field";
import { CHOICES, rowSentence } from "./import-words";

/** The rows judged against your book: new ones can be ticked, the rest say why they cannot. */
export function ImportPreviewStep({ preview, ticked, onTick, onType, types, onWrite, onBack, busy }: { preview: ImportPreview; ticked: ReadonlySet<number>; onTick: (next: Set<number>) => void; onType: (word: string, choice: TypeChoice | "") => void; types: Readonly<Record<string, TypeChoice>>; onWrite: () => void; onBack: () => void; busy: boolean }) {
  const fresh = preview.rows.filter((r) => r.status === "new");
  const rest = preview.rows.filter((r) => r.status !== "new");
  const toggle = (r: ImportRow) => {
    const next = new Set(ticked);
    if (next.has(r.index)) next.delete(r.index);
    else next.add(r.index);
    onTick(next);
  };
  const all = fresh.length > 0 && fresh.every((r) => ticked.has(r.index));
  return (
    <div className="om-panel im-step" role="group" aria-label="Satırlara bak">
      <h3 className="om-panel-title">
        {preview.rows.length === 0 ? "Dosyada işlem satırı yok." : `${fmtInt(preview.new)} yeni, ${fmtInt(preview.recorded)} zaten kayıtlı, ${fmtInt(preview.conflict + preview.invalid)} sorunlu satır.`}
      </h3>
      {!preview.started ? <p className="im-problem">Önce başlangıç paranı gir; ondan önce hiçbir satır yazılamaz.</p> : null}
      {preview.unknown_types.length ? (
        <div className="im-unknown">
          <p className="om-panel-lead">Dosyadaki şu işlem adlarını tanımıyorum. Ne olduklarını sen söyle, tahmin etmem.</p>
          {preview.unknown_types.map((w) => (
            <ImportField key={w} name={`“${w}”`}>
              {(a11y) => (
                <select {...a11y} value={types[w] ?? ""} onChange={(e) => onType(w, e.target.value as TypeChoice | "")}>
                  <option value="">Seç…</option>
                  {CHOICES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              )}
            </ImportField>
          ))}
        </div>
      ) : null}
      {fresh.length ? (
        <fieldset className="im-new">
          <legend className="u-caption">Deftere yazılacaklar</legend>
          <label className="im-check">
            <input type="checkbox" checked={all} onChange={() => onTick(all ? new Set() : new Set(fresh.map((r) => r.index)))} /> Hepsini seç
          </label>
          <ul className="im-rows">
            {fresh.map((r) => (
              <li key={r.index}>
                <label className="im-check">
                  <input type="checkbox" checked={ticked.has(r.index)} onChange={() => toggle(r)} /> <span>{rowSentence(r)}</span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      ) : null}
      {rest.length ? (
        <details className="im-rest" open={preview.new === 0}>
          <summary>Yazılmayacak satırlar ({rest.length})</summary>
          <ul className="im-rows">
            {rest.map((r) => (
              <li key={r.index} data-status={r.status}>
                <span>{rowSentence(r)}</span> <strong className="im-why">{r.status === "recorded" ? "Zaten kayıtlı. " : r.status === "skipped" ? "Almadım. " : "Yazamam: "}{r.status === "recorded" || r.status === "skipped" ? "" : r.reason}</strong>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <div className="om-actions">
        <Button variant="primary" size="lg" disabled={ticked.size === 0} data-pending={busy || undefined} onClick={onWrite}>
          {busy ? "Yazıyorum…" : `Seçtiğim ${fmtInt(ticked.size)} satırı deftere yaz`}
        </Button>
        <Button variant="secondary" size="lg" onClick={onBack}>Eşleştirmeye dön</Button>
      </div>
      <p className="im-note">Yazdıkların Geçmiş&apos;te kayıtlı kalır. Para hareketleri ve kâr payları kendi bölümlerinden geri alınır; alış ve satış satırlarını yazmadan önce iyi kontrol et. KAPtan para göndermez ve almaz.</p>
    </div>
  );
}
