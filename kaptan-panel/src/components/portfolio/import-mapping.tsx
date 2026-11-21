"use client";

import type { ImportKind, ImportMapping, ImportTable } from "@/lib/domain/imports";
import { Button } from "@/components/ui/button";
import { ImportField } from "./import-field";
import { CHOICES, FIELDS, mappingProblem } from "./import-words";

const PEEK = 5;
const COLUMN_NAME = (table: ImportTable, i: number) => {
  const head = table.rows[0]?.[i] ?? "";
  return `Sütun ${i + 1}${head ? `: ${head.slice(0, 24)}` : ""}`;
};

/**
 * Step 2: what the file looks like and which column is which. Nothing is guessed silently: the
 * columns named like a field are pre-selected, the person looks at the first rows and confirms.
 * The choice is remembered under the source name for the next file.
 */
export function ImportMappingStep({ table, mapping, onChange, onNext, onCancel, busy, remembered }: { table: ImportTable; mapping: ImportMapping; onChange: (m: ImportMapping) => void; onNext: () => void; onCancel: () => void; busy: boolean; remembered: boolean }) {
  const problem = mappingProblem(mapping);
  const peek = table.rows.slice(0, PEEK + (mapping.has_header ? 1 : 0));
  const set = (patch: Partial<ImportMapping>) => onChange({ ...mapping, ...patch });
  return (
    <div className="om-panel im-step" role="group" aria-label="Sütunları eşleştir">
      <h3 className="om-panel-title">Sütunları eşleştir</h3>
      <p className="om-panel-lead">
        {remembered ? "Bu kaynağı daha önce eşleştirmiştin; aynı eşleştirmeyi getirdim. Yine de bir göz at." : "Dosyanın ilk satırlarına bak ve hangi sütunun ne olduğunu seç. Bunu bir kez yaparsın; hatırlarım."}
        {table.file_kind === "pdf" ? " PDF'ten okunan tablo her zaman düzgün çıkmaz; işlemler yanlış çıkarsa CSV ya da Excel indirmeyi dene." : ""}
      </p>
      <div className="im-peek" tabIndex={0} role="region" aria-label="Dosyadan ilk satırlar">
        <table>
          <tbody>
            {peek.map((row, r) => (
              <tr key={r}>
                {Array.from({ length: table.columns }, (_, c) => (r === 0 && mapping.has_header ? <th key={c} scope="col">{row[c]}</th> : <td key={c}>{row[c]}</td>))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <label className="im-check">
        <input type="checkbox" checked={mapping.has_header} onChange={(e) => set({ has_header: e.target.checked })} /> İlk satır başlık, işlem değil
      </label>
      <div className="im-fields">
        {FIELDS.map((f) => (
          <ImportField key={f.key} name={f.label} hint={f.hint}>
            {(a11y) => (
              <select {...a11y} value={mapping[f.key] ?? ""} onChange={(e) => set({ [f.key]: e.target.value === "" ? null : Number(e.target.value) })}>
                <option value="">{f.key === "date" || f.key === "type" ? "Seç…" : "Bu dosyada yok"}</option>
                {Array.from({ length: table.columns }, (_, i) => (
                  <option key={i} value={i}>
                    {COLUMN_NAME(table, i)}
                  </option>
                ))}
              </select>
            )}
          </ImportField>
        ))}
        <ImportField name="Hepsi aynı türde mi?" hint="Örneğin yalnız kâr payı listesi.">
          {(a11y) => (
            <select {...a11y} value={mapping.fixed_kind ?? ""} onChange={(e) => set({ fixed_kind: e.target.value === "" ? null : (e.target.value as ImportKind), type: e.target.value === "" ? mapping.type : null })}>
              <option value="">Hayır, türü sütundan oku</option>
              {CHOICES.filter((c) => c.value !== "skip").map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          )}
        </ImportField>
      </div>
      {problem ? <p className="im-problem">{problem}</p> : null}
      <div className="om-actions">
        <Button variant="primary" size="lg" disabled={problem !== null} data-pending={busy || undefined} onClick={onNext}>
          {busy ? "Bakıyorum…" : "Eşleştirmeyi onayla, işlemlere bak"}
        </Button>
        <Button variant="secondary" size="lg" onClick={onCancel}>Vazgeç</Button>
      </div>
    </div>
  );
}
