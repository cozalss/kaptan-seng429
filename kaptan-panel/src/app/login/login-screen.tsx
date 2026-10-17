import type { Role } from "@/lib/domain/role-meta";
import { Wordmark } from "@/components/brand/marks";
import { DISCLAIMER_TR } from "@/components/brand/disclaimer";
import { LoginForm } from "./login-form";

/** What the product does, in the words a buyer checks first. */
const ASSURANCES = ["İki imzalı onay", "Doğrulanabilir denetim defteri", "Tek tuşla durdurma"] as const;

/**
 * The sign-in screen (/login and /login/<rol>): the product on the left (logo, name, one
 * line on what it does, three assurances), the sign-in card on the right, and a small footer
 * with the way back to the landing page and the disclaimer. One column on a phone.
 */
export function LoginScreen({ next, initialRole }: { next: string | null; initialRole: Role }) {
  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <main className="mx-auto grid w-full max-w-[1040px] flex-1 content-center gap-10 px-4 py-10 sm:px-8 sm:py-16 lg:grid-cols-[minmax(0,1fr)_440px] lg:gap-20">
        <div className="min-w-0 animate-page-in lg:pt-6">
          <Wordmark className="h-9 w-auto sm:h-10" />
          <h1 className="mt-8 font-display text-display tracking-[-0.015em] text-ink sm:mt-12 sm:text-hero">KAPtan Paneli</h1>
          <p className="mt-4 max-w-[40ch] text-lead text-ink-soft">
            KAP bildirimlerini okur, kurallarla tartar ve ekibinize imzaya hazır işlem önerileri sunar.
          </p>
          <ul aria-label="Güvenceler" className="mt-8 hidden space-y-3 sm:block">
            {ASSURANCES.map((a) => (
              <li key={a} className="flex items-center gap-3 text-ui text-ink">
                <svg aria-hidden viewBox="0 0 12 12" className="size-3.5 shrink-0 text-brand" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M2 6.5 5 9l5-6" />
                </svg>
                {a}
              </li>
            ))}
          </ul>
        </div>

        <section aria-labelledby="giris-baslik" className="min-w-0 border-2 border-ink bg-panel p-5 sm:p-8">
          <h2 id="giris-baslik" className="text-title font-semibold text-ink">
            Giriş yap
          </h2>
          <p className="mt-1 text-dense text-ink-soft">Seçtiğiniz hesap, paneldeki rolünüzü belirler.</p>
          <div className="mt-6">
            <LoginForm next={next} initialRole={initialRole} />
          </div>
        </section>
      </main>

      <footer className="border-t border-hairline">
        <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-3 px-4 py-5 sm:px-8 lg:flex-row lg:items-start lg:gap-10">
          <a href="/" className="group inline-flex min-h-11 shrink-0 items-center gap-1.5 text-dense font-medium text-ink lg:min-h-0">
            <span aria-hidden className="transition-transform duration-[var(--dur-quick)] group-hover:-translate-x-0.5">
              ←
            </span>
            Tanıtım sayfası
          </a>
          <p className="max-w-[90ch] text-meta text-ink-soft">{DISCLAIMER_TR}</p>
        </div>
      </footer>
    </div>
  );
}
