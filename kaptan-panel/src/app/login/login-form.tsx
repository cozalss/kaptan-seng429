"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ROLE_LABEL, ROLES, type Role } from "@/lib/domain/role-meta";
import { DEMO_PASSPHRASE } from "@/lib/auth/passphrase";
import { accountPerson } from "@/lib/auth/role-doors";
import { HOME, safeNext } from "@/lib/nav";
import { IS_MOCK } from "@/lib/api/config";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/** The same words the login schema (LoginInput in domain/user.ts) uses, without loading zod here. */
const MSG_REQUIRED = "Parola gerekli.";
const MSG_TOO_LONG = "Parola çok uzun.";
const MSG_WRONG = "Parola doğrulanamadı.";
const MAX_PASSPHRASE = 200;
const ERROR_ID = "login-error";
const HINT_ID = "login-hint";

/**
 * Sign-in: choose one of the four team accounts, type the passphrase, "Giriş yap". The chosen
 * account decides the role the session starts in (mock: POST /api/mock/session {passphrase,
 * role}; http: the role is a request and the API decides). A wrong passphrase gives one
 * generic message and puts the cursor back in the field.
 */
export function LoginForm({ next, initialRole }: { next: string | null; initialRole: Role }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [role, setRole] = useState<Role>(initialRole);
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const fail = (msg: string) => {
    setError(msg);
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
        fail(res.status === 401 ? MSG_WRONG : "Giriş şu an yapılamıyor. Biraz sonra yeniden dene.");
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

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const value = passphrase.trim();
    if (!value) return fail(MSG_REQUIRED);
    if (value.length > MAX_PASSPHRASE) return fail(MSG_TOO_LONG);
    setError(null);
    start(async () => {
      try {
        await signIn(value);
      } catch {
        fail(MSG_WRONG);
      }
    });
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <div>
        <p id="hesap-label" className="text-dense font-semibold text-ink">
          Hesap
        </p>
        <div role="radiogroup" aria-labelledby="hesap-label" className="mt-2 divide-y divide-hairline border-2 border-rule-ui">
          {ROLES.map((r) => (
            <label
              key={r}
              className={cn(
                "flex min-h-14 cursor-pointer items-center gap-3 px-3.5 py-2 transition-colors duration-[var(--dur-quick)]",
                "hover:bg-wash-tint has-[:checked]:bg-wash-tint has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-brand",
              )}
            >
              <input
                type="radio"
                name="hesap"
                value={r}
                checked={role === r}
                onChange={() => setRole(r)}
                className="size-[18px] shrink-0 accent-[var(--brand)] focus-visible:outline-none"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-ui font-semibold text-ink">{ROLE_LABEL[r]}</span>
                <span className="block text-meta text-ink-soft">{accountPerson(r)}</span>
              </span>
              <span aria-hidden className={cn(`tone-${r}`, "size-2.5 shrink-0 bg-[var(--tone)]")} />
            </label>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="parola" className="block text-dense font-semibold text-ink">
          Parola
        </label>
        <input
          ref={inputRef}
          id="parola"
          aria-invalid={Boolean(error)}
          aria-describedby={[error ? ERROR_ID : null, IS_MOCK ? HINT_ID : null].filter(Boolean).join(" ") || undefined}
          aria-errormessage={error ? ERROR_ID : undefined}
          type="password"
          autoComplete="current-password"
          autoCapitalize="none"
          spellCheck={false}
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          className={cn(
            "mt-2 h-12 w-full border-2 border-rule-ui bg-panel px-3.5 text-[16px] text-ink",
            "transition-[border-color] duration-[var(--dur-quick)] ease-[var(--ease-ink)]",
            "focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
            "aria-[invalid=true]:border-north",
          )}
        />
        {error ? (
          <p id={ERROR_ID} role="alert" className="mt-2 text-dense font-medium text-north">
            {error}
          </p>
        ) : null}
        {IS_MOCK ? (
          <p id={HINT_ID} className="mt-2 flex flex-wrap items-center gap-x-2 text-meta text-ink-soft">
            <span>
              Parola: <span className="code text-ink">{DEMO_PASSPHRASE}</span>
            </span>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setPassphrase(DEMO_PASSPHRASE);
                setError(null);
                inputRef.current?.focus();
              }}
              className="inline-flex min-h-11 items-center font-medium text-ink underline decoration-rule-ui underline-offset-4 hover:decoration-ink sm:min-h-0"
            >
              Doldur
            </button>
          </p>
        ) : null}
      </div>

      <Button type="submit" variant="primary" size="lg" className="w-full text-[16px]" pending={pending} disabled={pending}>
        {pending ? "Giriş yapılıyor…" : "Giriş yap"}
      </Button>
    </form>
  );
}
