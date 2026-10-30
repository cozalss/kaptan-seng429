import type { Role } from "@/lib/domain/role-meta";
import { Wordmark } from "@/components/brand/marks";
import { LoginForm } from "./login-form";

/** What the product does, in the words a buyer checks first, each with one line of proof. */
const ASSURANCES = [
  { title: "İki imzalı onay", note: "Kurallar ilk imzayı atar, Risk Sorumlusu ikinciyi." },
  { title: "Doğrulanabilir denetim defteri", note: "Her kayıt bir öncekinin parmak izini taşır." },
  { title: "Tek tuşla durdurma", note: "Bekleyen her öneri düşer, yeni emir çıkmaz." },
] as const;

/**
 * The sign-in screen (/login and /login/<rol>): the product on a navy panel (the sidebar's
 * colour, so signing in already looks like the desk), the sign-in card on the paper beside it,
 * and the way back to the landing page. On a phone the navy panel is a short band on top.
 */
export function LoginScreen({ next, initialRole }: { next: string | null; initialRole: Role }) {
  return (
    <div className="grid min-h-dvh bg-paper lg:grid-cols-[minmax(0,1fr)_minmax(520px,46%)]">
      <aside className="relative isolate overflow-hidden bg-navy text-on-navy">
        <Bearing />
        <div className="relative mx-auto flex h-full w-full max-w-[560px] flex-col px-6 py-8 sm:px-10 lg:py-14">
          <Wordmark className="h-9 w-auto self-start text-on-navy sm:h-10" />
          <div className="mt-8 animate-page-in lg:mt-auto">
            <h1 className="font-display text-display tracking-[-0.015em] text-on-navy sm:text-hero">KAPtan Paneli</h1>
            <p className="mt-4 max-w-[40ch] text-body text-on-navy-soft sm:text-lead">
              KAP bildirimlerini okur, kurallarla tartar ve ekibinize imzaya hazır işlem önerileri sunar.
            </p>
          </div>
          <ul aria-label="Güvenceler" className="mt-10 hidden gap-5 sm:grid lg:mt-14 lg:mb-auto">
            {ASSURANCES.map((a) => (
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
          <a
            href="/"
            className="group mt-8 hidden min-h-11 items-center gap-1.5 self-start text-dense font-medium text-on-navy-soft hover:text-on-navy focus-visible:outline-on-navy lg:inline-flex"
          >
            <span aria-hidden className="transition-transform duration-[var(--dur-quick)] group-hover:-translate-x-0.5">
              ←
            </span>
            Tanıtım sayfası
          </a>
        </div>
      </aside>

      <main className="flex flex-col">
        <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8 sm:py-16">
          <section
            aria-labelledby="giris-baslik"
            className="w-full max-w-[460px] rounded-2xl border border-line bg-panel p-5 shadow-[var(--shadow-raise)] sm:p-8"
          >
            <h2 id="giris-baslik" className="text-[24px] leading-8 font-semibold tracking-[-0.02em] text-ink">
              Giriş yap
            </h2>
            <p className="mt-1 text-dense text-ink-soft">Seçtiğiniz hesap, paneldeki rolünüzü belirler.</p>
            <div className="mt-6">
              <LoginForm next={next} initialRole={initialRole} />
            </div>
          </section>
        </div>
        <footer className="border-t border-line px-4 py-4 sm:px-8 lg:hidden">
          <a href="/" className="group inline-flex min-h-11 items-center gap-1.5 text-dense font-medium text-ink">
            <span aria-hidden className="transition-transform duration-[var(--dur-quick)] group-hover:-translate-x-0.5">
              ←
            </span>
            Tanıtım sayfası
          </a>
        </footer>
      </main>
    </div>
  );
}

/**
 * The navy panel's one ornament: the compass rose of the wordmark drawn large and faint, with
 * its bearing rings, bleeding off the corner. Decoration only.
 */
function Bearing() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 600 600"
      className="pointer-events-none absolute -right-48 -bottom-56 -z-10 size-[640px] text-on-navy opacity-[0.07] lg:-right-40 lg:-bottom-40 lg:size-[760px]"
      fill="none"
      stroke="currentColor"
    >
      <circle cx="300" cy="300" r="290" strokeWidth="2" />
      <circle cx="300" cy="300" r="230" strokeWidth="1" />
      <circle cx="300" cy="300" r="170" strokeWidth="1" strokeDasharray="2 10" />
      <path d="M300 10v580M10 300h580" strokeWidth="1" />
      <path d="M300 70 322 300H278Z" fill="currentColor" stroke="none" />
      <path d="M278 300 300 530 322 300" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}
