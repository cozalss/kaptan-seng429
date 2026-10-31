"use client";

import "./solo.css";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { IS_MOCK } from "@/lib/api/config";
import { DEMO_PASSPHRASE } from "@/lib/auth/passphrase";
import { safeNext } from "@/lib/nav";
import { homeFor, readView } from "@/lib/solo/view-pref";
import { cn } from "@/lib/utils";
import { Wordmark } from "@/components/brand/marks";
import { Bearing } from "@/app/login/login-screen";
import { Button } from "@/components/ui/button";

const MSG_REQUIRED = "Parola gerekli.";
const MSG_TOO_LONG = "Parola çok uzun.";
const MSG_WRONG = "Parola doğrulanamadı.";
const MAX_PASSPHRASE = 200;
const ERROR_ID = "solo-login-error";
const HINT_ID = "solo-login-hint";

/** Where to go after signing in: a safe ?next=, else the view used last, else the simple home. */
export function afterLogin(next: string | null): string {
  return safeNext(next) ?? homeFor(readView(), true);
}

/**
 * Single-user sign-in: one password, "Giriş yap", then "Benim KAPtan'ım". Mock: the session
 * route (the one account acts with every permission the home needs); http: POST /auth/login and
 * the backend decides.
 */
export function SoloLoginForm({ next }: { next: string | null }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const fail = (msg: string) => {
    setError(msg);
    inputRef.current?.focus();
  };

  const signIn = async (value: string) => {
    if (IS_MOCK) {
      const res = await fetch("/api/mock/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ passphrase: value }) });
      if (!res.ok) return fail(res.status === 401 ? MSG_WRONG : "Giriş şu an yapılamıyor. Biraz sonra yeniden dene.");
    } else {
      const { httpLogin } = await import("@/lib/api/http/http-api");
      await httpLogin(value);
    }
    router.replace(afterLogin(next));
    router.refresh();
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
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
    <form onSubmit={submit} noValidate className="space-y-5">
      <div>
        <label htmlFor="parola" className="block text-dense font-semibold text-ink">
          Parola
        </label>
        <input
          ref={inputRef}
          id="parola"
          type="password"
          autoComplete="current-password"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus
          aria-invalid={Boolean(error)}
          aria-describedby={[error ? ERROR_ID : null, IS_MOCK ? HINT_ID : null].filter(Boolean).join(" ") || undefined}
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          className={cn(
            "mt-2 h-12 w-full rounded-xl border-[1.5px] border-rule-ui bg-panel px-3.5 text-[16px] text-ink transition-[border-color] duration-[var(--dur-quick)]",
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

/** What the personal home gives, in the words a person checks first. */
const PROMISES = [
  { title: "Paran tek bakışta", note: "Ne kadar var, nasıl değişti, nerede duruyor." },
  { title: "Önerilere tek tuşla yanıt", note: "Her öneri sade bir cümleyle: al, sat ya da tut." },
  { title: "Her an durdurabilirsin", note: "Tek tuş yeni işlemleri durdurur; hisselerin satılmaz." },
] as const;

/**
 * The personal sign-in: the desk's navy panel with the promise of the home, and one password
 * field on the paper beside it. On a phone the navy panel is a short band on top.
 */
export function SoloLoginScreen({ next }: { next: string | null }) {
  return (
    <div data-solo className="grid min-h-dvh bg-paper text-ink lg:grid-cols-[minmax(0,1fr)_minmax(480px,44%)]">
      <aside className="relative isolate overflow-hidden bg-navy text-on-navy">
        <Bearing />
        <div className="relative mx-auto flex h-full w-full max-w-[560px] flex-col px-6 py-8 sm:px-10 lg:py-14">
          <Wordmark className="h-9 w-auto self-start text-on-navy sm:h-10" />
          <div className="mt-8 animate-page-in lg:mt-auto">
            <h1 className="font-display text-display tracking-[-0.015em] text-on-navy sm:text-hero">Benim KAPtan&apos;ım</h1>
            <p className="mt-4 max-w-[40ch] text-body text-on-navy-soft sm:text-lead">Paran, önerilerin ve son işlemlerin tek ekranda.</p>
          </div>
          <ul aria-label="Neler var" className="mt-10 hidden gap-5 sm:grid lg:mt-14 lg:mb-auto">
            {PROMISES.map((a) => (
              <li key={a.title} className="flex items-start gap-3.5">
                <span aria-hidden className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-navy-raised ring-1 ring-navy-line">
                  <svg viewBox="0 0 12 12" className="size-3 text-signal-ok" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 6.5 5 9l5-6" />
                  </svg>
                </span>
                <span className="min-w-0">
                  <span className="block text-ui font-semibold text-on-navy">{a.title}</span>
                  <span className="mt-0.5 block text-dense text-on-navy-soft">{a.note}</span>
                </span>
              </li>
            ))}
          </ul>
          <a href="/" className="group mt-8 hidden min-h-11 items-center gap-1.5 self-start text-dense font-medium text-on-navy-soft hover:text-on-navy lg:inline-flex">
            <span aria-hidden className="transition-transform duration-[var(--dur-quick)] group-hover:-translate-x-0.5">
              ←
            </span>
            Tanıtım sayfası
          </a>
        </div>
      </aside>
      <main className="flex flex-col">
        <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8 sm:py-16">
          <section aria-labelledby="giris-baslik" className="w-full max-w-[420px] rounded-2xl border border-line bg-panel p-5 shadow-[var(--shadow-raise)] sm:p-8">
            <h2 id="giris-baslik" className="text-[24px] leading-8 font-semibold tracking-[-0.02em] text-ink">
              Giriş yap
            </h2>
            <p className="mt-1 text-dense text-ink-soft">Parolanla gir; kaldığın yerden devam et.</p>
            <div className="mt-6">
              <SoloLoginForm next={next} />
            </div>
          </section>
        </div>
        <footer className="border-t border-line px-4 py-4 sm:px-8 lg:hidden">
          <a href="/" className="inline-flex min-h-11 items-center gap-1.5 text-dense font-medium text-ink">
            <span aria-hidden>←</span>
            Tanıtım sayfası
          </a>
        </footer>
      </main>
    </div>
  );
}
