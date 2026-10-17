"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { DropdownMenu as M } from "radix-ui";
import { ROUTES } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { MENU_CONTENT, MENU_ITEM } from "@/components/ui/menu";
import { notify } from "@/components/ui/toast";
import { ActiveRule } from "./active-rule";
import { logout } from "./session-actions";

/** A toothed cog in the panel's 1.5px line (drawn by hand, no icon library). */
function Cog() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path
        d="M10.3 2.5h3.4l.5 2.6 1.9.8 2.2-1.5 2.4 2.4-1.5 2.2.8 1.9 2.6.5v3.4l-2.6.5-.8 1.9 1.5 2.2-2.4 2.4-2.2-1.5-1.9.8-.5 2.6h-3.4l-.5-2.6-1.9-.8-2.2 1.5-2.4-2.4 1.5-2.2-.8-1.9-2.6-.5v-3.4l2.6-.5.8-1.9-1.5-2.2 2.4-2.4 2.2 1.5 1.9-.8z"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3.2" />
    </svg>
  );
}

/** ⚙ Ayarlar: the way to Ayarlar and out of the panel. Underlined like a nav link on /ayarlar. */
export function SettingsMenu() {
  const pathname = usePathname();
  const router = useRouter();
  const on = pathname === ROUTES.ayarlar;

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
        aria-label="Ayarlar ve çıkış"
        className={cn("group/cog relative inline-flex h-11 items-center outline-none sm:h-14", on ? "text-ink" : "text-ink-soft")}
      >
        {/* The right half of the top bar's one instrument (role · ⚙): the same 36px box, sharing
            the chip's border, so the two read as one piece of brass rather than two controls. */}
        <span
          className={cn(
            "inline-flex h-9 min-w-11 items-center justify-center gap-1.5 border-2 border-rule-ui bg-panel px-2.5 text-dense",
            "transition-colors duration-[var(--dur-quick)] ease-[var(--ease-ink)]",
            "group-hover/cog:bg-wash-tint group-hover/cog:text-ink group-data-[state=open]/cog:bg-wash-tint group-data-[state=open]/cog:text-ink",
            "group-focus-visible/cog:outline-2 group-focus-visible/cog:outline-offset-2 group-focus-visible/cog:outline-brand",
            on && "bg-wash-tint font-medium",
          )}
        >
          <span className="inline-flex transition-transform duration-[var(--dur-slow)] ease-[var(--ease-out-expo)] group-data-[state=open]/cog:rotate-45">
            <Cog />
          </span>
          <span className="hidden sm:inline">Ayarlar</span>
        </span>
        <ActiveRule on={on} className="inset-x-0" />
      </M.Trigger>
      <M.Portal>
        <M.Content align="end" sideOffset={2} className={MENU_CONTENT}>
          <M.Item asChild className={MENU_ITEM}>
            <Link href={ROUTES.ayarlar}>Ayarlar</Link>
          </M.Item>
          <M.Separator className="my-1 h-px bg-hairline" />
          <M.Item className={MENU_ITEM} onSelect={() => void signOut()}>
            Çıkış
          </M.Item>
        </M.Content>
      </M.Portal>
    </M.Root>
  );
}
