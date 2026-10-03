"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoginInput } from "@/lib/domain/user";
import { DEMO_ACCOUNTS, DEMO_PASSWORD, EXTRA_ACCOUNTS } from "@/lib/auth/accounts";
import { homeFor, safeNext } from "@/lib/auth/routes";
import { IS_MOCK } from "@/lib/api/config";
import { httpLogin } from "@/lib/api/http/http-api";
import { ROLE_CODE, ROLE_LABEL } from "@/lib/domain/user";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { cn } from "@/lib/utils";

export function LoginForm({ next }: { next: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submitRef = useRef<HTMLButtonElement>(null);

  const submit = (e?: React.FormEvent, creds?: { email: string; password: string }) => {
    e?.preventDefault();
    const parsed = LoginInput.safeParse(creds ?? { email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Bilgileri kontrol edin.");
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
            setError(res.status === 401 ? "Kimlik doğrulanamadı." : "Giriş şu an yapılamıyor.");
            return;
          }
          const body = (await res.json()) as { redirect: string };
          router.replace(body.redirect);
          router.refresh();
          return;
        }
        const me = await httpLogin(parsed.data.email, parsed.data.password);
        const role = me.roles[0];
        router.replace(safeNext(next) ?? (role ? homeFor(role) : "/inbox"));
      } catch {
        setError("Kimlik doğrulanamadı.");
      }
    });
  };

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="space-y-4" noValidate aria-describedby={error ? "login-error" : undefined}>
        <Field label="E-posta">
          {({ id, describedBy }) => (
            <Input id={id} aria-describedby={describedBy} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ad@kurum" />
          )}
        </Field>
        <Field label="Parola">
          {({ id, describedBy }) => (
            <Input id={id} aria-describedby={describedBy} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          )}
        </Field>
        {error ? (
          <p id="login-error" role="alert" className="border-l-[3px] border-north bg-north-tint px-3 py-2 text-dense font-medium text-north">
            {error}
          </p>
        ) : null}
        <Button ref={submitRef} type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>
          {pending ? "Giriş yapılıyor…" : "Giriş yap"}
        </Button>
        <p className="text-meta text-muted">Herkese açık kayıt yoktur. Hesapları Admin açar; Risk Officer ve Admin için TOTP zorunludur.</p>
      </form>

      {IS_MOCK ? (
        <section aria-labelledby="demo-accounts" className="border-t-[1.5px] border-ink pt-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2 id="demo-accounts" className="text-dense font-medium text-ink">
              Demo hesapları
            </h2>
            <span className="text-meta text-muted">
              Parola <span className="code text-ink">{DEMO_PASSWORD}</span> · yalnızca mock · tek tıkla giriş
            </span>
          </div>

          <button
            type="button"
            disabled={pending}
            onClick={() => {
              const jury = DEMO_ACCOUNTS.find((a) => a.role === "auditor");
              if (!jury) return;
              setEmail(jury.email);
              setPassword(DEMO_PASSWORD);
              submit(undefined, { email: jury.email, password: DEMO_PASSWORD });
            }}
            className="group mt-3 flex w-full items-center gap-4 border-[1.5px] border-ink bg-panel px-4 py-3 text-left shadow-ink transition-[transform,box-shadow] duration-150 hover:bg-wash-tint active:translate-x-[3px] active:translate-y-[3px] active:shadow-none disabled:opacity-60"
            aria-label="Jüri: denetci hesabıyla salt okunur giriş"
          >
            <span aria-hidden className="grid size-10 shrink-0 place-items-center border-[1.5px] border-ink bg-ink text-[15px] font-medium text-on-dark">
              U
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-ui font-medium text-ink">Jüri: denetci hesabıyla salt okunur giriş</span>
              <span className="block text-meta text-muted">Her ekranı görür, zinciri doğrular; hiçbir şey yazamaz.</span>
            </span>
            <span aria-hidden className="text-[18px] text-ink transition-transform group-hover:translate-x-0.5">
              →
            </span>
          </button>

          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {[...DEMO_ACCOUNTS.filter((a) => a.role !== "auditor"), ...EXTRA_ACCOUNTS].map((a) => {
              const active = email === a.email;
              return (
                <li key={a.uid}>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      setEmail(a.email);
                      setPassword(DEMO_PASSWORD);
                      submit(undefined, { email: a.email, password: DEMO_PASSWORD });
                    }}
                    className={cn(
                      "group flex w-full items-center gap-3 border-[1.5px] px-3 py-2.5 text-left disabled:opacity-60",
                      active ? "border-ink bg-wash-tint" : "border-rule-soft bg-panel hover:border-ink",
                    )}
                    aria-label={`${a.name} hesabıyla gir (${ROLE_LABEL[a.role]})`}
                  >
                    <span aria-hidden className={cn("grid size-9 shrink-0 place-items-center border-[1.5px] border-ink text-[14px] font-medium", active ? "bg-ink text-on-dark" : "bg-paper")}>
                      {ROLE_CODE[a.role]}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-dense font-medium text-ink">{a.name}</span>
                      <span className="block truncate text-meta text-muted">{a.blurb}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-meta text-muted">Dört göz adımları için ikinci Risk Officer (Elif) ya da paneldeki rol değiştirici kullanılır.</p>
        </section>
      ) : null}
    </div>
  );
}
