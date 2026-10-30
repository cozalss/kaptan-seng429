"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { DropdownMenu as M } from "radix-ui";
import {
  ROLE_LABEL,
  ROLES,
  memberForRole,
  type Role,
} from "@/lib/domain/role-meta";
import { ROUTES } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { MENU_CONTENT, MENU_ITEM } from "@/components/ui/menu";
import { notify } from "@/components/ui/toast";
import { useRole } from "@/components/roles/use-role";
import { logout } from "./session-actions";

/** The role's mark: a small square in its tone (role tones mark roles and nothing else). */
function RoleMark({ role, className }: { role: Role; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        `tone-${role}`,
        "inline-block size-2.5 shrink-0 bg-[var(--tone)]",
        className,
      )}
    />
  );
}

/** Initials in a disc of the role's tone (the sidebar's account card). */
function Avatar({ role, name }: { role: Role; name: string }) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toLocaleUpperCase("tr-TR");
  return (
    <span aria-hidden className={cn(`tone-${role}`, "grid size-9 shrink-0 place-items-center rounded-full bg-[var(--tone)] text-dense font-semibold text-on-dark ring-2 ring-white/25")}>
      {initials}
    </span>
  );
}

/**
 * The account menu at the right of the top bar: who is signed in (name and role), "Hesap
 * değiştir" with the four team accounts (the choice is kept in the session; the guided tour
 * and the tests switch here), Ayarlar and Çıkış. The trigger's accessible name starts with
 * "Rol: <rol>." so a screen reader hears the role first.
 */
export function AccountMenu({ variant = "bar", collapsed = false }: { variant?: "bar" | "sidebar"; collapsed?: boolean }) {
  const router = useRouter();
  const { role, user, switchTo, switching } = useRole();
  // The switch is confirmed by a short slip ("Hesap değişti: …", use-role.ts), read out by the toaster.
  const pick = (next: Role) => void switchTo(next);
  const side = variant === "sidebar";

  const signOut = async () => {
    try {
      router.replace(await logout());
      router.refresh();
    } catch {
      notify.error("Çıkış yapılamadı", "Bir daha dene.");
    }
  };

  return (
    <M.Root modal={false}>
      <M.Trigger
        aria-label={`Rol: ${ROLE_LABEL[role]}. Hesap: ${user.name}`}
        aria-busy={switching || undefined}
        data-testid="account-menu"
        className={cn(
          "group flex min-w-0 items-center gap-3 text-left outline-none",
          "transition-colors duration-[var(--dur-quick)] ease-[var(--ease-ink)]",
          side
            ? "w-full rounded-xl border border-navy-line bg-white/[0.06] p-2.5 pr-3 hover:bg-navy-raised data-[state=open]:bg-navy-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-navy"
            : "h-11 max-w-[220px] rounded-lg border-2 border-rule-ui bg-panel pr-2.5 pl-3 hover:bg-wash-tint data-[state=open]:bg-wash-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
          side && collapsed && "lg:justify-center lg:border-transparent lg:bg-transparent lg:p-1",
          switching && "cursor-progress",
        )}
      >
        {side ? <Avatar role={role} name={user.name} /> : <RoleMark role={role} />}
        <span className={cn("min-w-0 flex-1 leading-tight", side && collapsed && "lg:sr-only")}>
          <span className={cn("block truncate font-semibold", side ? "text-ui text-on-navy" : "text-dense text-ink")}>{user.name}</span>
          <span className={cn("truncate text-meta leading-[18px]", side ? "block text-on-navy-soft" : "hidden text-ink-soft sm:block")}>{ROLE_LABEL[role]}</span>
        </span>
        <svg
          aria-hidden
          viewBox="0 0 10 10"
          className={cn(
            "size-2.5 shrink-0 transition-transform duration-[var(--dur-quick)]",
            side ? "rotate-180 text-on-navy-soft group-data-[state=open]:rotate-0" : "text-ink-soft group-data-[state=open]:rotate-180",
            side && collapsed && "lg:hidden",
          )}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path d="M2 4l3 3 3-3" />
        </svg>
      </M.Trigger>
      <M.Portal>
        <M.Content
          side={side ? "top" : "bottom"}
          align={side ? "start" : "end"}
          sideOffset={8}
          className={cn(
            MENU_CONTENT,
            "w-[280px] max-w-[calc(100vw-24px)] py-0",
          )}
        >
          <div className="border-b border-hairline px-4 py-3">
            <p className="text-ui font-semibold text-ink">{user.name}</p>
            <p className="text-meta text-ink-soft">{ROLE_LABEL[role]}</p>
          </div>
          <M.Label className="px-4 pt-3 pb-1 text-meta font-medium text-ink-soft">
            Hesap değiştir
          </M.Label>
          <M.RadioGroup value={role} onValueChange={(v) => pick(v as Role)}>
            {ROLES.map((r) => (
              <M.RadioItem
                key={r}
                value={r}
                className="flex cursor-pointer items-center gap-3 px-4 py-2.5 text-ui text-ink outline-none data-[highlighted]:bg-wash-tint data-[state=checked]:font-semibold"
              >
                <RoleMark role={r} />
                <span className="min-w-0 flex-1 truncate">
                  {ROLE_LABEL[r]}{" "}
                  <span className="font-normal text-ink-soft">
                    · {memberForRole(r).name}
                  </span>
                </span>
                <M.ItemIndicator aria-hidden className="text-brand">
                  <svg
                    viewBox="0 0 12 12"
                    className="size-3"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path d="M2 6.5 5 9l5-6" />
                  </svg>
                </M.ItemIndicator>
              </M.RadioItem>
            ))}
          </M.RadioGroup>
          <M.Separator className="mt-1 h-px bg-hairline" />
          <M.Item asChild className={MENU_ITEM}>
            <Link href={ROUTES.ayarlar}>Ayarlar</Link>
          </M.Item>
          <M.Item
            className={cn(MENU_ITEM, "mb-1")}
            onSelect={() => void signOut()}
          >
            Çıkış
          </M.Item>
        </M.Content>
      </M.Portal>
    </M.Root>
  );
}
