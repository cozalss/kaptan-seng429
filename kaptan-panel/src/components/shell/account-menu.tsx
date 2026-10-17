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

/**
 * The account menu at the right of the top bar: who is signed in (name and role), "Hesap
 * değiştir" with the four team accounts (the choice is kept in the session; the guided tour
 * and the tests switch here), Ayarlar and Çıkış. The trigger's accessible name starts with
 * "Rol: <rol>." so a screen reader hears the role first.
 */
export function AccountMenu() {
  const router = useRouter();
  const { role, user, switchTo, switching } = useRole();
  // The switch is confirmed by a short slip ("Hesap değişti: …", use-role.ts), read out by the toaster.
  const pick = (next: Role) => void switchTo(next);

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
          "group inline-flex h-11 max-w-[220px] min-w-0 items-center gap-2.5 border-2 border-rule-ui bg-panel pr-2.5 pl-3 text-left outline-none",
          "transition-colors duration-[var(--dur-quick)] ease-[var(--ease-ink)] hover:bg-wash-tint data-[state=open]:bg-wash-tint",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
          switching && "cursor-progress",
        )}
      >
        <RoleMark role={role} />
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-dense font-semibold text-ink">
            {user.name}
          </span>
          <span className="hidden truncate text-meta leading-[18px] text-ink-soft sm:block">
            {ROLE_LABEL[role]}
          </span>
        </span>
        <svg
          aria-hidden
          viewBox="0 0 10 10"
          className="size-2.5 shrink-0 text-ink-soft transition-transform duration-[var(--dur-quick)] group-data-[state=open]:rotate-180"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path d="M2 4l3 3 3-3" />
        </svg>
      </M.Trigger>
      <M.Portal>
        <M.Content
          align="end"
          sideOffset={6}
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
