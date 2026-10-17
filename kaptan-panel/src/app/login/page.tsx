import type { Metadata } from "next";
import { safeNext } from "@/lib/nav";
import { Wordmark } from "@/components/brand/marks";
import { DISCLAIMER_TR } from "@/components/brand/disclaimer";
import { Doors } from "./doors";
import { LoginFrame } from "./login-frame";
import "./login.css";

export const metadata: Metadata = { title: "Giriş" };

/**
 * /login — one entrance, four doors. Pick the role you work as; its door opens into that
 * role's own sign-in screen (/login/<rol>). ?next= is carried through the door.
 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <LoginFrame back={{ href: "/", label: "Tanıtım sayfası" }}>
      <main className="relative z-[2] mx-auto flex w-full max-w-[1200px] flex-1 flex-col px-4 pt-6 pb-[150px] sm:px-8 sm:pt-10">
        <Wordmark className="h-10 w-auto self-start sm:h-12" />
        <div className="mt-7 grid gap-3 sm:mt-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end lg:gap-12">
          <h1 className="font-display text-display text-balance text-ink sm:text-display-lg lg:text-hero">Hangi kapıdan giriyorsun?</h1>
          <p className="max-w-[46ch] text-body text-ink-soft lg:pb-2">
            Tayfa okur, kurallar tartar, son imza insanın. İlk kez mi? Risk Sorumlusu kapısından gir; son imzayı o atar.
          </p>
        </div>
        <div aria-hidden className="mt-7 mb-6 h-[2px] bg-ink sm:mt-10 sm:mb-8" />
        <Doors next={safeNext(next)} />
        <p className="mt-10 max-w-[64ch] text-meta leading-[18px] text-ink-soft">{DISCLAIMER_TR}</p>
      </main>
    </LoginFrame>
  );
}
