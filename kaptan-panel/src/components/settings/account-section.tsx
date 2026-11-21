"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useApi, useApiMutation } from "@/lib/api/react";
import { errorMessage } from "@/lib/api/types";
import { realName, useSession } from "@/lib/auth/session-context";
import { logout } from "@/components/shell/session-actions";
import { ConfirmAction } from "@/components/solo/stop-panel";
import { PlainField } from "@/components/solo/plain-field";
import { Button } from "@/components/ui/button";
import "./comfort.css";

export const MIN_PASSWORD = 6;

/** What is wrong with the two new passwords, in words, or null. Mirrors the API's rules (the API has the last word). */
export function newPasswordProblem(next: string, again: string): string | null {
  if (next.length < MIN_PASSWORD)
    return `Yeni parola en az ${MIN_PASSWORD} karakter olmalı.`;
  if (next !== again) return "İki parola aynı değil.";
  return null;
}

/** "Parolanı değiştirdin." and, when other devices were signed out, how many. */
export function changedSentence(signedOut: number): string {
  return signedOut > 0
    ? `Parolan değişti. Diğer cihazlardaki ${signedOut} oturum kapandı.`
    : "Parolan değişti.";
}

/** Hesabın: the name, a new password, sign out here, sign out everywhere. */
export function AccountSection() {
  const router = useRouter();
  const name = realName(useSession().name);
  const [leaving, setLeaving] = useState(false);
  return (
    <section aria-labelledby="hesap" className="ay-account ay-block">
      <h2 id="hesap" className="u-chapter text-ink">
        Hesabın
      </h2>
      <p className="mt-2 text-body text-ink-soft">
        {name ? `${name} olarak girdin.` : "Giriş yaptın."}
      </p>
      <PasswordForm />
      <div className="cf-actions">
        <Button
          variant="secondary"
          pending={leaving}
          disabled={leaving}
          onClick={async () => {
            setLeaving(true);
            router.push(await logout());
          }}
        >
          {leaving ? "Çıkılıyor…" : "Çıkış yap"}
        </Button>
        <EverywhereButton />
      </div>
    </section>
  );
}

function EverywhereButton() {
  const api = useApi();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <ConfirmAction
      trigger={<Button variant="secondary">Her yerden çıkış yap</Button>}
      title="Her yerden çıkış yapılsın mı?"
      description="Bu bilgisayar dahil tüm cihazlardaki oturumlar kapanır. Yeniden girmek için parolanı yazarsın."
      confirm="Evet, her yerden çık"
      busy="Çıkılıyor…"
      tone="default"
      pending={pending}
      error={error}
      onConfirm={async () => {
        setPending(true);
        setError(null);
        try {
          await api.signOutEverywhere();
        } catch (e) {
          setError(errorMessage(e));
          setPending(false);
          return false;
        }
        router.push(await logout());
        return true;
      }}
    />
  );
}

function PasswordForm() {
  const change = useApiMutation((api, current: string, next: string) =>
    api.changePassword({ current, next }),
  );
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [local, setLocal] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setDone(null);
    const problem = newPasswordProblem(next, again);
    setLocal(problem);
    if (problem) return;
    const result = await change.run(current, next);
    if (!result) return;
    setCurrent("");
    setNext("");
    setAgain("");
    setDone(changedSentence(result.signed_out_others));
  };

  return (
    <form
      className="cf-password"
      onSubmit={(e) => void submit(e)}
      aria-labelledby="parola-baslik"
    >
      <h3 id="parola-baslik" className="ay-channel-state">
        Parolanı değiştir
      </h3>
      <PlainField
        label="Şimdiki parolan"
        type="password"
        autoComplete="current-password"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        error={null}
        required
      />
      <PlainField
        label="Yeni parolan"
        hint={`En az ${MIN_PASSWORD} karakter.`}
        type="password"
        autoComplete="new-password"
        value={next}
        onChange={(e) => setNext(e.target.value)}
        error={null}
        required
      />
      <PlainField
        label="Yeni parolayı bir daha yaz"
        type="password"
        autoComplete="new-password"
        value={again}
        onChange={(e) => setAgain(e.target.value)}
        error={local ?? change.error}
        required
      />
      <Button
        type="submit"
        variant="primary"
        pending={change.pending}
        disabled={change.pending || !current || !next || !again}
      >
        {change.pending ? "Değiştiriliyor…" : "Parolayı değiştir"}
      </Button>
      <p role="status" className="ay-result" data-ok="true">
        {done ?? ""}
      </p>
    </form>
  );
}
