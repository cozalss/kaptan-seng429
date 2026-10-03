import type { Metadata } from "next";
import { safeNext } from "@/lib/nav";
import { IS_MOCK } from "@/lib/api/config";
import { Wordmark } from "@/components/brand/marks";
import { DISCLAIMER_TR } from "@/components/brand/disclaimer";
import { DemoRibbon } from "@/components/shell/banners";
import { LoginForm } from "./login-form";
import { CalmSea } from "./calm-sea";
import "./login.css";

export const metadata: Metadata = { title: "Giriş" };

/**
 * /login — one passphrase, one user. The logo, one sentence, the field, the button; the calm
 * sea from the landing sits low under it.
 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-paper">
      {IS_MOCK ? <DemoRibbon /> : null}
      <div className="mx-auto flex w-full max-w-[752px] items-center px-4 pt-4 sm:px-6">
        {/* The landing lives at "/" in the same deployment; a plain <a> leaves the app router. */}
        <a href="/" className="group inline-flex min-h-11 items-center gap-1.5 text-[14px] text-ink-soft hover:text-ink">
          <span aria-hidden className="transition-transform duration-[var(--dur-quick)] group-hover:-translate-x-0.5">
            ←
          </span>
          Tanıtım sayfası
        </a>
      </div>
      <main className="relative z-[2] mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center px-4 pt-8 pb-[150px] sm:px-0">
        <Wordmark className="h-12 w-auto self-start" />
        <h1 className="mt-8 font-display text-[34px] leading-[1.12] text-balance text-ink sm:text-[40px]">Tayfa okur, kurallar tartar, son imza senin.</h1>
        <div className="mt-8">
          <LoginForm next={safeNext(next)} />
        </div>
        <p className="mt-10 text-[12px] leading-[18px] text-muted">{DISCLAIMER_TR}</p>
      </main>
      <CalmSea className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-[120px] w-full" />
    </div>
  );
}
