"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { TelegramLevel, TelegramStatus } from "@/lib/domain/telegram";
import { useApiMutation, useApiQuery } from "@/lib/api/react";
import { Button } from "@/components/ui/button";
import { PlainField } from "@/components/solo/plain-field";
import {
  agoWords,
  BOTFATHER_URL,
  CAP_CHOICES,
  capSentence,
  CLOUD_ON_LEAD,
  CLOUD_SETUP_LEAD,
  CLOUD_SETUP_STEPS,
  CLOUD_SETUP_SUMMARY,
  CLOUD_TITLE,
  cloudWarning,
  CONNECTED_DETAIL,
  LEVEL_HINT,
  LEVEL_LABEL,
  LEVELS,
  SAMPLE_BUTTON,
  TELEGRAM_LEAD,
  TELEGRAM_LEAD_CLOUD,
  TELEGRAM_STEPS,
  telegramSentence,
  UNLINK_BUTTON,
} from "./telegram-words";
import { announceSettingsChanged } from "./settings-events";
import { AdvancedFold } from "./settings-group";
import "./price-alerts.css";

const POLL_MS = 3000;

/**
 * Ayarlar · Telegram: follow KAP from the phone. Four plain steps (BotFather, paste the code, Bağla, tap the link),
 * then the level (Daha az / Normal / Daha çok), the daily limit, an example message and "Bağlantıyı kaldır".
 * The bot code is sent once and never shown again.
 */
export function TelegramSection() {
  const q = useApiQuery((api) => api.telegramStatus(), []);
  // What an action just answered wins until the next look at the server brings a newer answer.
  const [local, setLocal] = useState<{ base: TelegramStatus | undefined; value: TelegramStatus } | null>(null);
  const setStatus = (value: TelegramStatus) => {
    setLocal({ base: q.data, value });
    announceSettingsChanged();
  };
  const s = local && local.base === q.data ? local.value : (q.data ?? null);
  const [note, setNote] = useState<string | null>(null);

  // While the link waits for the phone, look again every few seconds.
  const waiting = s?.pairing_open === true;
  const { refetch } = q;
  useEffect(() => {
    if (!waiting) return;
    const id = setInterval(() => void refetch(), POLL_MS);
    return () => clearInterval(id);
  }, [waiting, refetch]);

  return (
    <section aria-labelledby="telegram-baslik" id="telegram" className="ay-block">
      <h2 id="telegram-baslik">
        <span className="pf-name">
          Telegram<span className="sr-only">. </span>
        </span>
        <span className="u-chapter block text-ink">{telegramSentence(s)}</span>
      </h2>
      <p className="ay-block-lead">{s?.cloud_on ? TELEGRAM_LEAD_CLOUD : TELEGRAM_LEAD}</p>
      {s ? <CloudBlock status={s} /> : null}
      {s?.paired ? (
        <Connected status={s} onStatus={setStatus} onNote={setNote} />
      ) : s ? (
        <Steps status={s} onStatus={setStatus} onNote={setNote} onRefresh={refetch} />
      ) : null}
      <p role="status" className="ay-result" data-ok={q.error ? "false" : "true"}>
        {q.error ?? note ?? ""}
      </p>
    </section>
  );
}

function Steps({
  status,
  onStatus,
  onNote,
  onRefresh,
}: {
  status: TelegramStatus;
  onStatus: (s: TelegramStatus) => void;
  onNote: (t: string | null) => void;
  onRefresh: () => Promise<void>;
}) {
  const [token, setToken] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const save = useApiMutation((api, t: string) => api.saveTelegram({ token: t }));
  const pair = useApiMutation((api) => api.pairTelegram());

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    onNote(null);
    if (token.trim() === "") return;
    const done = await save.run(token.trim());
    if (done) {
      onStatus(done);
      setToken("");
    }
  };
  const connect = async () => {
    onNote(null);
    const done = await pair.run();
    if (done) {
      setLink(done.pair_link);
      await onRefresh(); // the server now says "waiting for the phone": the screen starts looking every few seconds
    }
  };

  return (
    <ol aria-label="Telegram’ı bağlamak için dört adım" className="ay-steps">
      <li className="ay-step">
        <span aria-hidden className="ay-step-n">1</span>
        <div>
          {TELEGRAM_STEPS.one}{" "}
          <a href={BOTFATHER_URL} target="_blank" rel="noopener noreferrer" className="underline">
            BotFather’ı aç
          </a>
        </div>
      </li>
      <li className="ay-step">
        <span aria-hidden className="ay-step-n">2</span>
        <div>
          {TELEGRAM_STEPS.two}
          {status.configured ? (
            <p className="ay-channel-detail">
              Kaydedildi{status.bot_username ? ` (@${status.bot_username})` : ""}. Değiştirmek istersen yeni kodu yapıştır.
            </p>
          ) : null}
          <form onSubmit={(e) => void submit(e)} noValidate aria-label="Bot kodunu kaydet" className="pa-form">
            <PlainField
              label="Bot kodu"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              error={save.error}
              hint="Bu kod yalnızca bu bilgisayarda saklanır, bir daha gösterilmez."
            />
            <div className="cf-actions">
              <Button type="submit" variant="secondary" pending={save.pending} disabled={save.pending || token.trim() === ""}>
                Kaydet
              </Button>
            </div>
          </form>
        </div>
      </li>
      <li className="ay-step">
        <span aria-hidden className="ay-step-n">3</span>
        <div>
          {TELEGRAM_STEPS.three}
          <div className="cf-actions">
            <Button variant="secondary" pending={pair.pending} disabled={!status.configured || pair.pending} onClick={() => void connect()}>
              Bağla
            </Button>
          </div>
          {pair.error ? <span role="alert" className="mf-error">{pair.error}</span> : null}
        </div>
      </li>
      <li className="ay-step">
        <span aria-hidden className="ay-step-n">4</span>
        <div>
          {TELEGRAM_STEPS.four}
          {link && status.pairing_open ? (
            <p className="ay-channel-detail">
              <a href={link} target="_blank" rel="noopener noreferrer" className="underline">
                Telegram’da aç
              </a>{" "}
              Bağlantı 15 dakika geçerli ve bir kez kullanılır. Bu bağlantıyı başkasına verme.
            </p>
          ) : null}
        </div>
      </li>
    </ol>
  );
}

function Connected({
  status,
  onStatus,
  onNote,
}: {
  status: TelegramStatus;
  onStatus: (s: TelegramStatus) => void;
  onNote: (t: string | null) => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const change = useApiMutation((api, input: { level?: TelegramLevel; daily_cap?: number }) => api.saveTelegram(input));
  const sample = useApiMutation((api) => api.sendTelegramSample());
  const unlink = useApiMutation((api) => api.unlinkTelegram());

  const apply = async (input: { level?: TelegramLevel; daily_cap?: number }) => {
    onNote(null);
    const done = await change.run(input);
    if (done) onStatus(done);
  };
  const send = async () => {
    onNote(null);
    const done = await sample.run();
    if (done) {
      onStatus(done);
      onNote("Mesajı telefonuna gönderdim. Altındaki düğmeler gerçek mesajlardakiyle aynı.");
    }
  };
  const remove = async () => {
    const done = await unlink.run();
    if (done) {
      onStatus(done);
      onNote("Bağlantıyı kaldırdım. Yeniden bağlamak için dört adımı baştan yapabilirsin.");
    }
    setConfirm(false);
  };
  const failure = change.error ?? sample.error ?? unlink.error;

  return (
    <div className="mt-4">
      <p className="ay-channel-detail">
        Bağlı{status.bot_username ? ` (@${status.bot_username})` : ""}. {CONNECTED_DETAIL}
      </p>
      <AdvancedFold>
      <fieldset className="cf-seg mt-5">
        <legend className="cf-label">Kaç mesaj gelsin?</legend>
        <div className="cf-seg-row">
          {LEVELS.map((v) => (
            <label key={v} className="cf-seg-item">
              <input
                type="radio"
                name="telegram-seviye"
                value={v}
                checked={status.level === v}
                disabled={change.pending}
                onChange={() => void apply({ level: v })}
              />
              <span>{LEVEL_LABEL[v]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <p className="ay-channel-detail">{LEVEL_HINT[status.level]}</p>
      <label className="mf-label mt-5 block" htmlFor="telegram-sinir">
        Günlük anlık mesaj sınırı
      </label>
      <select
        id="telegram-sinir"
        className="mf-plain mt-1 block h-10 rounded-lg border-2 border-rule-ui bg-panel px-3 text-ui text-ink"
        value={status.daily_cap}
        disabled={change.pending}
        onChange={(e) => void apply({ daily_cap: Number(e.target.value) })}
      >
        {[...new Set([...CAP_CHOICES, status.daily_cap])].sort((a, b) => a - b).map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      <p className="ay-channel-detail">{capSentence(status.daily_cap)}</p>
      </AdvancedFold>
      <div className="ay-test">
        <Button variant="secondary" pending={sample.pending} disabled={sample.pending} onClick={() => void send()}>
          {SAMPLE_BUTTON}
        </Button>
        {confirm ? (
          <>
            <Button variant="secondary" pending={unlink.pending} onClick={() => void remove()}>
              Evet, kaldır
            </Button>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Vazgeç
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={() => setConfirm(true)}>
            {UNLINK_BUTTON}
          </Button>
        )}
      </div>
      {failure ? <p role="alert" className="mf-error">{failure}</p> : null}
    </div>
  );
}

/**
 * Bulut takibi: a Cloudflare Worker follows KAP while the computer is off. On: the last sync and the last cloud message
 * (never a secret or an address). Off: the three steps, folded away until asked for.
 */
function CloudBlock({ status }: { status: TelegramStatus }) {
  // The page shows "how long ago", which needs the clock; it is read once per status so the text never flickers.
  const [now] = useState(() => Date.now());
  if (!status.cloud_on) {
    return (
      <details className="ay-cloud mt-4" data-testid="cloud-off">
        <summary className="cursor-pointer text-ui text-ink">{CLOUD_SETUP_SUMMARY}</summary>
        <p className="ay-channel-detail">{CLOUD_SETUP_LEAD}</p>
        <ol aria-label="Bulut takibini kurmak için üç adım" className="ay-steps">
          {[CLOUD_SETUP_STEPS.one, CLOUD_SETUP_STEPS.two, CLOUD_SETUP_STEPS.three].map((text, i) => (
            <li key={text} className="ay-step">
              <span aria-hidden className="ay-step-n">{i + 1}</span>
              <div>{text}</div>
            </li>
          ))}
        </ol>
      </details>
    );
  }
  const warning = cloudWarning(status);
  return (
    <div className="mb-6 mt-4" data-testid="cloud-on">
      <h3 className="cf-label">{CLOUD_TITLE}: açık</h3>
      <p className="ay-channel-detail">{CLOUD_ON_LEAD}</p>
      <dl className="ay-channel-detail">
        <div>
          <dt className="inline">Son eşitleme: </dt>
          <dd className="inline">{agoWords(status.cloud_synced_at, now)}</dd>
        </div>
        <div>
          <dt className="inline">Son bulut mesajı: </dt>
          <dd className="inline">{agoWords(status.cloud_message_at, now)}</dd>
        </div>
      </dl>
      {warning ? <p role="status" className="mf-error">{warning}</p> : null}
    </div>
  );
}
