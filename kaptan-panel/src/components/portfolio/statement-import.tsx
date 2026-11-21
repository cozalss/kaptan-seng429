"use client";

import "@/components/ufuk/ufuk.css";
import "./own-money.css";
import "./import.css";

import { useRef, useState, type ChangeEvent } from "react";
import { IMPORT_MAX_SOURCE, type ImportMapping, type ImportPreview, type ImportRow, type ImportTable, type TypeChoice } from "@/lib/domain/imports";
import { useApi } from "@/lib/api/react";
import { errorMessage } from "@/lib/api/types";
import { fmtInt } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { ImportField } from "./import-field";
import { ImportMappingStep } from "./import-mapping";
import { ImportPreviewStep } from "./import-preview";
import { fileProblem, rowSentence, suggestMapping } from "./import-words";

type Step = { name: "start" } | { name: "map"; table: ImportTable; remembered: boolean } | { name: "check"; table: ImportTable };

const DEFAULT_SOURCE = "Midas ekstresi";

/**
 * Param's statement importer ("Dökümünü yükle"). Three calm steps: pick the file, say which column is
 * which, look at the rows and tick the ones to write. The file is read in memory by the server and never
 * kept; what you tick is written as ordinary, audited book rows. The same file twice adds nothing.
 */
export function StatementImport({ onChanged }: { onChanged: () => void }) {
  const api = useApi();
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState("");
  const [step, setStep] = useState<Step>({ name: "start" });
  const [mapping, setMapping] = useState<ImportMapping | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [ticked, setTicked] = useState<ReadonlySet<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [failed, setFailed] = useState<ImportRow[]>([]);
  const opener = useRef<HTMLButtonElement | null>(null);

  const reset = (message: string | null) => {
    setOpen(false);
    setStep({ name: "start" });
    setMapping(null);
    setPreview(null);
    setTicked(new Set());
    setError(null);
    setStatus(message);
    requestAnimationFrame(() => opener.current?.focus());
  };
  const guard = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const request = (table: ImportTable, m: ImportMapping) => ({ source: source.trim() || DEFAULT_SOURCE, mapping: m, number_style: table.number_style, rows: table.rows });
  const look = (table: ImportTable, m: ImportMapping) =>
    guard(async () => {
      const p = await api.importPreview(request(table, m));
      setPreview(p);
      setTicked(new Set(p.rows.filter((r) => r.status === "new").map((r) => r.index)));
      setStep({ name: "check", table });
    });

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    // Left empty, the file's own name stands in, so nobody has to invent one to go on.
    const name = source.trim() || file.name.replace(/\.[^.]+$/, "").slice(0, IMPORT_MAX_SOURCE) || DEFAULT_SOURCE;
    if (!source.trim()) setSource(name);
    const problem = fileProblem(file);
    if (problem) return setError(problem);
    setStatus(null);
    void guard(async () => {
      const table = await api.importRead(file, file.name, name);
      const remembered = table.saved_mapping !== null && table.saved_matches;
      setMapping(remembered ? table.saved_mapping : suggestMapping(table.rows[0] ?? [], table.has_header_guess));
      setStep({ name: "map", table, remembered });
    });
  };

  const choose = (word: string, choice: TypeChoice | "") => {
    if (!mapping || step.name !== "check") return;
    const types = { ...mapping.types };
    if (choice === "") delete types[word];
    else types[word] = choice;
    const next = { ...mapping, types };
    setMapping(next);
    if (choice !== "") void look(step.table, next);
  };

  const write = () => {
    if (!mapping || step.name !== "check") return;
    const table = step.table;
    void guard(async () => {
      const result = await api.importApply({ ...request(table, mapping), selected: [...ticked] });
      setFailed(result.failed);
      onChanged();
      reset(result.written > 0 ? `${fmtInt(result.written)} işlem Param’a eklendi.${result.failed.length ? ` ${fmtInt(result.failed.length)} işlem eklenemedi.` : ""}` : "Hiçbir işlem eklenmedi.");
    });
  };

  return (
    <section aria-labelledby="dokum" className="om im">
      <div className="om-head">
        <h2 id="dokum" className="u-chapter text-ink">Dökümünü yükle</h2>
        <p className="om-lead">
          Bankandan ya da aracı kurumundan indirdiğin döküm dosyasını (CSV, Excel ya da içindeki yazıyı fareyle seçebildiğin PDF; en çok 5 MB) yükle. Ben okurum, sen sütunları onaylarsın, Param’a yalnız seçtiğin işlemler eklenir. Dosya saklanmaz. Aynı dosyayı iki kez yüklersen ikinci kez bir şey eklenmez.
        </p>
      </div>
      {!open ? (
        <div className="om-actions">
          <Button ref={opener} variant="secondary" size="lg" aria-expanded={false} onClick={() => { setOpen(true); setStatus(null); setFailed([]); }}>
            Dökümünü yükle
          </Button>
        </div>
      ) : null}
      <p role="status" className="om-status">{status}</p>
      {failed.length ? (
        <ul className="im-rows" aria-label="Eklenemeyen işlemler">
          {failed.map((r) => <li key={r.index}>{rowSentence(r)} <strong className="im-why">{r.reason}</strong></li>)}
        </ul>
      ) : null}
      {open && step.name === "start" ? (
        <div className="om-panel im-step" role="group" aria-label="Dosyayı seç">
          <h3 className="om-panel-title">1. Dosyayı seç</h3>
          <ImportField name="Dökümün adı" hint="İstersen yaz; aynı yerden gelen dosyaların eşleştirmesini bu adla hatırlarım. Boş bırakırsan dosyanın adını kullanırım.">
            {(a11y) => <input {...a11y} type="text" value={source} maxLength={IMPORT_MAX_SOURCE} autoComplete="off" placeholder="Örneğin: Midas ekstresi" onChange={(e) => setSource(e.target.value)} />}
          </ImportField>
          <label className="im-file">
            <input type="file" accept=".csv,.tsv,.txt,.xlsx,.pdf" onChange={onFile} disabled={busy} />
            <span>{busy ? "Okuyorum…" : "Dosya seç"}</span>
          </label>
          <div className="om-actions"><Button variant="secondary" size="lg" onClick={() => reset(null)}>Vazgeç</Button></div>
        </div>
      ) : null}
      {open && step.name === "map" && mapping ? (
        <ImportMappingStep table={step.table} mapping={mapping} remembered={step.remembered} busy={busy} onChange={setMapping} onNext={() => void look(step.table, mapping)} onCancel={() => reset(null)} />
      ) : null}
      {open && step.name === "check" && preview && mapping ? (
        <ImportPreviewStep preview={preview} ticked={ticked} onTick={(n) => setTicked(n)} types={mapping.types} onType={choose} busy={busy} onWrite={write} onBack={() => setStep({ name: "map", table: step.table, remembered: false })} />
      ) : null}
      {error ? <p role="alert" className="im-problem">{error}</p> : null}
    </section>
  );
}
