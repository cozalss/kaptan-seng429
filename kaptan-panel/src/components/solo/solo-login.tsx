"use client";

import "./solo.css";

import { useCallback, useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { isReachable, signIn } from "@/lib/api/client";
import { errorMessage, isUnreachable } from "@/lib/api/types";
import { HOME, safeNext } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { Wordmark } from "@/components/brand/marks";
import { Boat } from "@/components/ufuk/boat";
import { Sea } from "@/components/ufuk/sea";
import { UnreachableNote } from "@/components/shell/unreachable";
import { Button } from "@/components/ui/button";

const MSG_REQUIRED = "Parola gerekli.";
const MSG_TOO_LONG = "Parola çok uzun.";
const MAX_PASSPHRASE = 200;
const ERROR_ID = "solo-login-error";

/** Where to go after signing in: a safe ?next=, else home. */
export function afterLogin(next: string | null): string {
  return safeNext(next) ?? HOME;
}

/** Is the API answering? Asked once on arrival, again on "Yeniden dene". */
function useReachable() {
  const [down, setDown] = useState(false);
  const [checking, setChecking] = useState(false);
  const retry = useCallback(() => {
    setChecking(true);
    void isReachable().then((up) => {
      setDown(!up);
      setChecking(false);
    });
  }, []);
  useEffect(() => {
    void isReachable().then((up) => setDown(!up));
  }, []);
  return { down, checking, retry, markDown: () => setDown(true) };
}

/** The sign-in: one password, "Giriş yap". If the API does not answer, it says so instead. */
export function SoloLoginForm({ next }: { next: string | null }) {
  const router = useRouter();
  const api = useReachable();
  const inputRef = useRef<HTMLInputElement>(null);
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const fail = (msg: string) => {
    setError(msg);
    inputRef.current?.focus();
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
        router.replace(afterLogin(next));
        router.refresh();
      } catch (e) {
        if (isUnreachable(e)) api.markDown();
        else fail(errorMessage(e));
      }
    });
  };

  if (api.down) return <UnreachableNote onRetry={api.retry} pending={api.checking} />;

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
          aria-describedby={error ? ERROR_ID : undefined}
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          className={cn(
            "mt-2 h-12 w-full border-2 border-ink bg-paper px-3.5 text-[16px] text-ink transition-[border-color] duration-[var(--dur-quick)]",
            "focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
            "aria-[invalid=true]:border-north",
          )}
        />
        {error ? (
          <p id={ERROR_ID} role="alert" className="mt-2 text-dense font-medium text-north">
            {error}
          </p>
        ) : null}
      </div>
      <Button type="submit" variant="primary" size="lg" className="w-full text-[16px]" pending={pending} disabled={pending}>
        {pending ? "Giriş yapılıyor…" : "Giriş yap"}
      </Button>
    </form>
  );
}

/**
 * The sign-in, one calm scene: the boat at rest on the horizon, what this is in plain words, and
 * one password field on a sheet laid over the water.
 */
export function SoloLoginScreen({ next }: { next: string | null }) {
  return (
    <div data-solo className="scene text-ink">
      <header className="u-page flex h-[72px] shrink-0 items-center justify-between gap-4">
        <Wordmark className="solo-wordmark h-10 w-auto" />
        <a href="/" className="inline-flex min-h-11 items-center gap-1.5 text-dense font-medium text-ink underline decoration-rule-ui underline-offset-4 hover:decoration-ink">
          Tanıtım sayfası
        </a>
      </header>
      <Sea className="scene-sea" />
      <Boat className="scene-boat scene-boat--login" />
      <main className="u-page grid flex-1 content-between gap-x-14 gap-y-8 pb-8 lg:grid-cols-[minmax(0,1fr)_400px] lg:content-normal lg:items-start lg:pb-14">
        <div className="min-w-0 lg:pt-[5vh]">
          <h1 className="u-sentence scene-title text-ink">
            <span className="u-sentence__line">Sen karar ver,</span>{" "}
            <span className="u-sentence__line u-sentence__line--indent">KAPtan okusun.</span>
          </h1>
          <p className="mt-5 max-w-[46ch] text-body text-ink-soft sm:text-[18px] sm:leading-7">
            KAPtan, şirketlerin her gün yaptığı duyuruları senin için okur. Önemli bir şey görürse sade bir öneri getirir. Sen onaylamadan hiçbir işlem yapılmaz.
          </p>
        </div>
        <section aria-labelledby="giris-baslik" className="sheet scene-sheet w-full max-w-[440px] p-5 sm:p-7">
          <h2 id="giris-baslik" className="text-[22px] leading-8 font-semibold tracking-[-0.02em] text-ink">
            Giriş yap
          </h2>
          <div className="mt-4">
            <SoloLoginForm next={next} />
          </div>
        </section>
      </main>
    </div>
  );
}
