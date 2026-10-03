"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoginInput } from "@/lib/domain/user";
import { DEMO_PASSPHRASE } from "@/lib/auth/passphrase";
import { HOME, safeNext } from "@/lib/nav";
import { IS_MOCK } from "@/lib/api/config";
import { httpLogin } from "@/lib/api/http/http-api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * Single-user sign-in: one passphrase, no accounts. A wrong passphrase gives one generic
 * message and a short shake (none under reduced motion). Mock mode prints the demo passphrase
 * and can fill it in one click.
 */
export function LoginForm({ next }: { next: string | null }) {
  const router = useRouter();
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState(0);
  const [pending, start] = useTransition();

  const fail = (msg: string) => {
    setError(msg);
    setErrorKey((k) => k + 1);
  };

  const submit = (e?: React.FormEvent, value?: string) => {
    e?.preventDefault();
    const parsed = LoginInput.safeParse({ passphrase: value ?? passphrase });
    if (!parsed.success) {
      fail(parsed.error.issues[0]?.message ?? "Parolayı kontrol et.");
      return;
    }
    setError(null);
    start(async () => {
      try {
        if (IS_MOCK) {
          const res = await fetch("/api/mock/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(next ? { ...parsed.data, next } : parsed.data),
          });
          if (!res.ok) {
            fail(res.status === 401 ? "Parola doğrulanamadı." : "Giriş şu an yapılamıyor.");
            return;
          }
          const body = (await res.json()) as { redirect: string };
          router.replace(body.redirect);
          router.refresh();
          return;
        }
        await httpLogin(parsed.data.passphrase);
        router.replace(safeNext(next) ?? HOME);
      } catch {
        fail("Parola doğrulanamadı.");
      }
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate aria-describedby={error ? "login-error" : undefined}>
      <label htmlFor="parola" className="block text-[14px] text-ink-soft">
        Parola
      </label>
      <input
        key={errorKey}
        id="parola"
        aria-invalid={Boolean(error)}
        type="password"
        autoComplete="current-password"
        autoCapitalize="none"
        spellCheck={false}
        autoFocus
        value={passphrase}
        onChange={(e) => setPassphrase(e.target.value)}
        className={cn(
          "h-13 w-full border-[1.5px] border-ink bg-panel px-3.5 text-[16px] text-ink",
          "transition-shadow duration-[var(--dur-quick)] ease-[var(--ease-ink)] focus-visible:shadow-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand",
          "aria-[invalid=true]:border-north",
          errorKey > 0 && "login-shake",
        )}
      />
      {error ? (
        <p id="login-error" role="alert" className="text-[14px] font-medium text-north">
          {error}
        </p>
      ) : null}
      <Button type="submit" variant="primary" size="lg" className="h-13 w-full text-[16px]" disabled={pending}>
        {pending ? "Giriliyor…" : "Giriş"}
      </Button>
      {IS_MOCK ? (
        <p className="pt-2 text-[14px] text-muted">
          Demo parolası: <span className="code text-ink">{DEMO_PASSPHRASE}</span> ·{" "}
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setPassphrase(DEMO_PASSPHRASE);
              submit(undefined, DEMO_PASSPHRASE);
            }}
            className="font-medium text-ink underline underline-offset-4 hover:text-wash"
          >
            doldur ve gir
          </button>
        </p>
      ) : null}
    </form>
  );
}
