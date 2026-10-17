import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { safeNext } from "@/lib/nav";
import { ROLE_LABEL } from "@/lib/domain/role-meta";
import { doorPeople, loginHref, ROLE_DOOR, ROLE_SLUG, roleFromSlug } from "@/lib/auth/role-doors";
import { DISCLAIMER_TR } from "@/components/brand/disclaimer";
import { RoleEmblem } from "@/components/roles/role-emblem";
import { LoginForm } from "../login-form";
import { LoginFrame } from "../login-frame";
import "../login.css";

type Props = { params: Promise<{ rol: string }>; searchParams: Promise<{ next?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const role = roleFromSlug((await params).rol);
  return { title: role ? `${ROLE_LABEL[role]} girişi` : "Giriş" };
}

/**
 * /login/<rol> — one role's own sign-in screen: its tone washes the page, the door's arch and
 * emblem grow into the left column (shared view-transition names with /login), the role in
 * Bodoni, what you do in it, then the passphrase. The session starts as this role.
 */
export default async function RoleLoginPage({ params, searchParams }: Props) {
  const [{ rol }, { next }] = await Promise.all([params, searchParams]);
  const role = roleFromSlug(rol);
  if (!role) notFound();
  const slug = ROLE_SLUG[role];
  const door = ROLE_DOOR[role];
  const safe = safeNext(next);
  const people = doorPeople(role);

  return (
    <LoginFrame back={{ href: loginHref(null, safe), label: "Başka bir rol" }} className={`tone-${role} bg-[var(--tone-wash)]`}>
      <main className="relative z-[2] mx-auto grid w-full max-w-[1120px] flex-1 content-start gap-6 px-4 pt-4 pb-[150px] sm:px-8 sm:pt-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:content-center lg:gap-20">
        <div className="flex items-end gap-5 lg:block">
          <div
            className="login-arch relative grid h-[148px] w-[124px] shrink-0 place-items-center rounded-t-full border-[1.5px] border-b-0 border-[var(--tone)] bg-panel lg:h-[min(560px,62vh)] lg:w-full"
            style={{ viewTransitionName: `door-${slug}` }}
          >
            <div aria-hidden className="absolute inset-[10px] rounded-t-full border border-b-0 border-[var(--tone)] opacity-35 lg:inset-[18px]" />
            <RoleEmblem
              role={role}
              className="login-emblem mt-6 size-[72px] text-[var(--tone)] lg:mt-16 lg:size-[220px]"
              style={{ viewTransitionName: `emblem-${slug}` }}
            />
            <div aria-hidden className="absolute inset-x-[-1.5px] bottom-0 h-[1.5px] bg-ink" />
          </div>
          <p className="label pb-1 text-[var(--tone)] lg:hidden">
            {people}
          </p>
        </div>

        <div className="min-w-0 animate-page-in">
          <p className="label hidden text-[var(--tone)] lg:block">
            {role === "auditor" ? people : `Bu koltukta · ${people}`}
          </p>
          <h1
            className="mt-0 w-fit font-display text-display text-ink sm:text-display-lg lg:mt-3 lg:text-hero"
            style={{ viewTransitionName: `name-${slug}` }}
          >
            {ROLE_LABEL[role]}
          </h1>
          <p className="mt-3 font-display-text text-lead text-[var(--tone)] sm:text-title">{door.line}</p>

          <h2 className="label mt-7 text-ink-soft">Bu rolle neler yaparsın</h2>
          <ul className="mt-3 space-y-2 border-l-[1.5px] border-[var(--tone)] pl-4">
            {door.does.map((line) => (
              <li key={line} className="text-ui text-ink sm:text-body">
                {line}
              </li>
            ))}
          </ul>

          <div className="mt-8 max-w-[440px] border-[1.5px] border-t-[4px] border-ink border-t-[var(--tone)] bg-panel p-4 sm:p-6">
            <LoginForm next={safe} role={role} />
          </div>
          <p className="mt-8 max-w-[60ch] text-meta leading-[18px] text-ink-soft">{DISCLAIMER_TR}</p>
        </div>
      </main>
    </LoginFrame>
  );
}
