import { ROLE_LABEL, ROLES, type Role } from "@/lib/domain/role-meta";
import { doorPeople, loginHref, ROLE_DOOR, ROLE_SLUG } from "@/lib/auth/role-doors";
import { RoleEmblem } from "@/components/roles/role-emblem";
import { cn } from "@/lib/utils";

/**
 * The four doors of /login. Each is one card: an arched plate in the role's tone holding its
 * emblem, the role's verb in small capitals ("İMZALAR"), the role in Bodoni, one plain
 * sentence, who sits behind it. The role's name is the link (stretched over the card) and the
 * sentence is its description, so a screen reader hears "Risk Sorumlusu, bağlantı, Son imzayı
 * sen atarsın." The plate, emblem and name carry view-transition names that the role's own
 * screen reuses, so the door opens into it (login.css).
 */
export function Doors({ next }: { next: string | null }) {
  return (
    <ul aria-label="Roller" className="grid gap-3 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4">
      {ROLES.map((role, i) => (
        <Door key={role} role={role} index={i} next={next} />
      ))}
    </ul>
  );
}

function Door({ role, index, next }: { role: Role; index: number; next: string | null }) {
  const slug = ROLE_SLUG[role];
  const door = ROLE_DOOR[role];
  const lineId = `kapi-${slug}`;
  return (
    <li
      className={cn(
        `tone-${role}`,
        "login-door group relative grid grid-cols-[92px_1fr] gap-4 border-[1.5px] border-ink bg-panel p-3 animate-page-in",
        "sm:grid-cols-1 sm:grid-rows-[auto_1fr] sm:gap-0 sm:p-0",
      )}
      style={{ animationDelay: `${80 + index * 70}ms` }}
    >
      <div className="sm:px-5 sm:pt-5">
        <div
          className="login-arch relative grid h-[112px] place-items-center rounded-t-full border-[1.5px] border-b-0 border-[var(--tone)] bg-[var(--tone-wash)] sm:h-[220px]"
          style={{ viewTransitionName: `door-${slug}` }}
        >
          <RoleEmblem
            role={role}
            className="login-emblem mt-5 size-[52px] text-[var(--tone)] sm:mt-10 sm:size-[124px]"
            style={{ viewTransitionName: `emblem-${slug}` }}
          />
        </div>
        <div aria-hidden className="h-[1.5px] bg-ink" />
      </div>
      <div className="flex min-w-0 flex-col py-1 sm:px-5 sm:pt-4 sm:pb-5">
        <p className="label text-[var(--tone)]">{door.verb}</p>
        <h2 className="mt-1 font-display-text text-title text-ink">
          <a
            href={loginHref(role, next)}
            aria-describedby={lineId}
            className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:outline-[3px] focus-visible:after:outline-offset-[6px] focus-visible:after:outline-brand focus-visible:after:outline-solid"
            style={{ viewTransitionName: `name-${slug}` }}
          >
            {ROLE_LABEL[role]}
          </a>
        </h2>
        <p id={lineId} className="mt-1.5 text-ui text-ink-soft sm:mt-2 sm:pb-5">
          {door.line}
        </p>
        <p className="mt-auto flex items-center justify-between gap-3 pt-3 text-dense text-muted sm:border-t sm:border-hairline sm:pt-3">
          <span className="truncate">{doorPeople(role)}</span>
          <span aria-hidden className="shrink-0 font-medium text-[var(--tone)] transition-transform duration-[var(--dur-base)] ease-[var(--ease-ink)] group-hover:translate-x-1">
            Gir →
          </span>
        </p>
      </div>
    </li>
  );
}
