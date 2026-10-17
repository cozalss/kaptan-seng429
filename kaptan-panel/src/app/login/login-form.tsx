"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ROLE_LABEL, type Role } from "@/lib/domain/role-meta";
import { DEMO_PASSPHRASE } from "@/lib/auth/passphrase";
import { HOME, safeNext } from "@/lib/nav";
import { IS_MOCK } from "@/lib/api/config";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/** The same words the login schema (LoginInput in domain/user.ts) uses, without loading zod here. */
const MSG_REQUIRED = "Parola gerekli";
const MSG_TOO_LONG = "Parola çok uzun";
const MAX_PASSPHRASE = 200;
const ERROR_ID = "login-error";

/**
 * Sign-in behind one role's door: one passphrase, no accounts. The session starts as `role`
 * (mock); in http mode the role is a request and the API decides. A wrong passphrase gives one
 * generic message, puts the cursor back in the field and gives it a short shake (none under
 * reduced motion). Mock mode prints the passphrase and can fill it in one click. The button
 * wears the door's tone (`--tone`).
 */
export function LoginForm({ next, role }: { next: string | null; role: Role }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  /** Restart the shake on the same element: drop the class, force a reflow, add it back. */
  const shake = () => {
    const el = inputRef.current;
    if (!el) return;
    el.classList.remove("login-shake");
    void el.offsetWidth;
    el.classList.add("login-shake");
  };

  const fail = (msg: string) => {
    setError(msg);
    shake();
    inputRef.current?.focus();
  };

  const signIn = async (value: string) => {
    if (IS_MOCK) {
      const res = await fetch("/api/mock/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next ? { passphrase: value, role, next } : { passphrase: value, role }),
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
    const { httpLogin } = await import("@/lib/api/http/http-api");
    await httpLogin(value, role);
    router.replace(safeNext(next) ?? HOME);
  };

  const submit = (e?: React.FormEvent, v?: string) => {
    e?.preventDefault();
    const value = (v ?? passphrase).trim();
    if (!value) return fail(MSG_REQUIRED);
    if (value.length > MAX_PASSPHRASE) return fail(MSG_TOO_LONG);
    setError(null);
    start(async () => {
      try {
        await signIn(value);
      } catch {
        fail("Parola doğrulanamadı.");
      }
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <label htmlFor="parola" className="label block text-ink-soft">
        Parola
      </label>
      <input
        ref={inputRef}
        id="parola"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? ERROR_ID : undefined}
        aria-errormessage={error ? ERROR_ID : undefined}
        type="password"
        autoComplete="current-password"
        autoCapitalize="none"
        spellCheck={false}
        autoFocus
        value={passphrase}
        onChange={(e) => setPassphrase(e.target.value)}
        className={cn(
          "h-13 w-full border-2 border-ink bg-panel px-3.5 text-[16px] text-ink",
          "transition-[box-shadow,border-color] duration-[var(--dur-quick)] ease-[var(--ease-ink)]",
          "focus-visible:border-brand focus-visible:shadow-[3px_3px_0_var(--brand)] focus-visible:outline-none",
          "aria-[invalid=true]:border-north",
        )}
      />
      {error ? (
        <p id={ERROR_ID} role="alert" className="text-ui font-medium text-north">
          {error}
        </p>
      ) : null}
      <Button
        type="submit"
        variant="primary"
        size="lg"
        className="h-13 w-full border-[var(--tone,var(--ink))] bg-[var(--tone,var(--ink))] text-[16px] hover:border-ink hover:bg-ink"
        disabled={pending}
      >
        {pending ? "Giriliyor…" : `${ROLE_LABEL[role]} olarak gir`}
        <span aria-hidden>→</span>
      </Button>
      {IS_MOCK ? (
        <p className="pt-2 text-ui text-muted">
          Parola: <span className="code text-ink">{DEMO_PASSPHRASE}</span> ·{" "}
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setPassphrase(DEMO_PASSPHRASE);
              submit(undefined, DEMO_PASSPHRASE);
            }}
            className="inline-flex min-h-11 items-center font-medium text-ink underline underline-offset-4 hover:text-[var(--tone,var(--wash))]"
          >
            doldur ve gir
          </button>
        </p>
      ) : null}
    </form>
  );
}
