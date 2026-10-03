import type { Metadata } from "next";
import { safeNext } from "@/lib/auth/routes";
import { IS_MOCK } from "@/lib/api/config";
import { Compass, Wordmark } from "@/components/brand/marks";
import { DISCLAIMER_TR } from "@/components/brand/disclaimer";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Giriş" };

/** /login — owned by S4 for polish (PANEL-CONTRACT.md); the foundation ships a finished page. */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="min-h-dvh bg-paper">
      {IS_MOCK ? (
        <div className="flex h-[var(--ribbon-h)] items-center gap-3 bg-wash px-4 text-meta text-on-dark">
          <span className="border border-on-dark/70 px-1.5 leading-[16px] font-medium">DEMO VERİSİ</span>
          <span className="truncate">Kurgusal şirketler, örnek değerler, sanal para.</span>
        </div>
      ) : null}
      <div className="mx-auto grid min-h-[calc(100dvh-var(--ribbon-h))] max-w-[1280px] grid-cols-1 lg:grid-cols-[1.15fr_1fr]">
        {/* Left page: the book's title plate */}
        <section className="relative flex flex-col justify-between overflow-hidden border-b-[1.5px] border-ink px-6 pt-8 pb-10 sm:px-10 lg:border-r-[1.5px] lg:border-b-0 lg:py-12">
          <div className="flex items-center justify-between">
            {/* The landing page lives at "/" in the same deployment; a plain <a> leaves the app router. */}
            <a href="/" aria-label="KAPtan tanıtım sayfasına dön">
              <Wordmark className="h-9 w-auto sm:h-10" />
            </a>
            <a href="/" className="inline-flex min-h-11 items-center text-meta text-muted underline-offset-4 hover:text-ink hover:underline">
              ← Tanıtım sayfası
            </a>
          </div>

          <div className="relative my-10 lg:my-0">
            <p className="mb-5 text-dense text-ink-soft">Bölüm 0 · Köprü üstü</p>
            <h1 className="title-display text-[clamp(56px,9vw,120px)] text-ink">
              Masa
              <span className="block pl-[1.05em]">açık.</span>
            </h1>
            <div className="mt-8 max-w-[440px] -rotate-[0.8deg] border-[1.5px] border-ink bg-panel px-5 py-4 shadow-ink">
              <p className="font-display text-[clamp(22px,1.9vw,27px)] leading-snug text-ink">
                Yapay zekâ okur ve kanıt toplar. Kurallar karar verir. Son imzayı bir insan atar.
              </p>
              <p className="mt-2 text-meta text-muted">KAPtan Paneli · otomatik emir yok, her öneri insan onayına gider</p>
            </div>
          </div>

          <div className="flex items-end gap-5">
            <Compass size={72} className="shrink-0" />
            <svg aria-hidden viewBox="0 0 400 60" preserveAspectRatio="none" className="h-12 min-w-0 flex-1 text-wash">
              <path d="M0 38 C40 30 70 44 110 36 S180 26 220 36 S300 46 340 34 S385 30 400 34" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <path d="M0 48 C50 42 90 52 140 46 S230 40 270 47 S350 52 400 45" fill="none" stroke="var(--ink)" strokeWidth="1" opacity="0.5" />
              <path d="M0 56 C60 52 120 58 190 54 S320 50 400 55" fill="none" stroke="currentColor" strokeWidth="0.8" opacity="0.6" />
            </svg>
          </div>
        </section>

        {/* Right page: the form */}
        <section className="flex flex-col justify-center px-6 py-10 sm:px-10 lg:px-14">
          <div className="mx-auto w-full max-w-[460px]">
            <h2 className="font-display text-[34px] leading-tight text-ink">Panele giriş</h2>
            <p className="mt-1.5 mb-7 text-ui text-ink-soft">Analist, Risk Officer, Admin ve Auditor rolleri.</p>
            <LoginForm next={safeNext(next)} />
            <p className="mt-10 text-meta leading-[18px] text-muted">{DISCLAIMER_TR}</p>
          </div>
        </section>
      </div>
    </div>
  );
}
