"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth/session-context";
import { ROLE_CODE, ROLE_LABEL } from "@/lib/domain/user";
import { sessionState } from "@/lib/market";
import { fmtInt, fmtPct, fmtTime } from "@/lib/format";
import { useNow } from "@/lib/clock";
import { cn } from "@/lib/utils";
import { Kbd } from "@/components/ui/primitives";
import { Tooltip } from "@/components/ui/overlay";
import { useDesk } from "./desk-state";
import { logout } from "./session-actions";

/** Market session chip: "Sürekli işlem · 18:00'e kadar" with the clock. */
export function SessionChip({ className }: { className?: string }) {
  const now = useNow(15_000);
  if (now === null) return <span className={cn("h-5 w-40", className)} />;
  const iso = new Date(now).toISOString();
  const s = sessionState(iso);
  return (
    <span className={cn("inline-flex items-center gap-2 text-dense whitespace-nowrap", className)} aria-label={`Piyasa: ${s.label}, ${s.detail}`}>
      <span aria-hidden className={cn("size-2 border", s.isOpen ? "border-wash bg-wash animate-pulse-dot" : "border-muted bg-transparent")} />
      <span className="font-medium text-ink">{s.label}</span>
      <span className="hidden text-muted xl:inline">· {s.detail}</span>
      <time dateTime={iso} className="text-muted tabular-nums">
        {fmtTime(iso)}
      </time>
    </span>
  );
}

/** Today's counters as one sentence (11 Adım 1), live from /stream/feed. */
export function CountersLine({ className }: { className?: string }) {
  const { counters, feedStatus } = useDesk();
  if (!counters) return <span className={cn("h-5 w-72", className)} aria-hidden />;
  const n = (v: number) => <b className="font-medium text-ink tabular-nums">{fmtInt(v)}</b>;
  return (
    <Link
      href="/inbox"
      className={cn("inline-flex items-center gap-2 text-dense whitespace-nowrap text-ink-soft hover:text-ink", className)}
      aria-label={`Bugün ${counters.total} bildirim, ${counters.noise} gürültü elendi, ${counters.processed} işleme alındı, ${counters.e_candidates} E adayı`}
    >
      <span aria-hidden className={cn("size-1.5", feedStatus === "open" ? "bg-ink animate-pulse-dot" : "bg-muted")} />
      <span>
        {n(counters.total)} bildirim · {n(counters.noise)} elendi · {n(counters.processed)} işlendi · {n(counters.e_candidates)} E-adayı
      </span>
    </Link>
  );
}

export function KillSwitchChip() {
  const { risk } = useDesk();
  if (!risk) return null;
  if (risk.kill_switch === "on") {
    return (
      <Link href="/portfolio" className="inline-flex h-8 items-center gap-2 border-[1.5px] border-north bg-north px-2.5 text-dense font-medium text-on-dark">
        <span aria-hidden className="size-2 bg-on-dark animate-pulse-dot" />
        KILL SWITCH AÇIK
      </Link>
    );
  }
  if (risk.halted_today) {
    return (
      <Link href="/portfolio" className="inline-flex h-8 items-center gap-2 border-[1.5px] border-ink bg-ochre px-2.5 text-dense font-medium text-ink">
        YENİ EMİR DURDU
      </Link>
    );
  }
  return (
    <Tooltip content={`Günlük K/Z ${fmtPct(risk.daily_pnl_pct, 2)} · zirveden ${fmtPct(risk.drawdown_pct, 2)}`}>
      <Link href="/portfolio" className="hidden h-8 items-center gap-2 border border-rule-soft px-2.5 text-dense text-ink-soft hover:border-ink hover:text-ink md:inline-flex">
        <span aria-hidden className="size-2 border border-ink" />
        Kill switch kapalı
      </Link>
    </Tooltip>
  );
}

export function PendingApprovals() {
  const { pending } = useDesk();
  const count = pending.length;
  return (
    <Link
      href="/approvals"
      className={cn(
        "inline-flex h-8 items-center gap-2 border-[1.5px] px-2.5 text-dense font-medium",
        count > 0 ? "border-ink bg-ink text-on-dark hover:bg-wash hover:border-wash" : "border-rule-soft text-ink-soft hover:border-ink",
      )}
      aria-label={`${count} bekleyen onay`}
    >
      <span className="hidden sm:inline">Onay</span>
      <span className="tabular-nums">{count}</span>
    </Link>
  );
}

export function Topbar({ onMenu, onSearch }: { onMenu: () => void; onSearch: () => void }) {
  const user = useSession();
  const router = useRouter();
  return (
    <header className="sticky top-[var(--chrome-top,0px)] z-30 border-b-[1.5px] border-ink bg-paper/95 backdrop-blur-[2px]">
      <div className="flex h-[var(--topbar-h)] items-center gap-3 px-3 sm:px-5">
        <button
          type="button"
          onClick={onMenu}
          className="grid size-9 place-items-center border-[1.5px] border-ink bg-panel lg:hidden"
          aria-label="Menüyü aç"
        >
          <svg aria-hidden width="16" height="12" viewBox="0 0 16 12">
            <path d="M0 1h16M0 6h11M0 11h16" stroke="var(--ink)" strokeWidth="1.6" />
          </svg>
        </button>
        <SessionChip />
        <span aria-hidden className="hidden h-5 w-px bg-hairline lg:block" />
        <CountersLine className="hidden lg:inline-flex" />
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onSearch}
            className="inline-flex h-8 items-center gap-2 border border-rule-soft bg-panel px-2 text-dense text-ink-soft hover:border-ink hover:text-ink"
            aria-label="Komut paleti (Ctrl K)"
          >
            <svg aria-hidden width="13" height="13" viewBox="0 0 13 13">
              <circle cx="5.5" cy="5.5" r="4.3" fill="none" stroke="currentColor" strokeWidth="1.4" />
              <path d="M8.7 8.7 12 12" stroke="currentColor" strokeWidth="1.4" />
            </svg>
            <span className="hidden md:inline">Ara</span>
            <Kbd className="hidden md:inline-grid">⌘K</Kbd>
          </button>
          <PendingApprovals />
          <KillSwitchChip />
          <Tooltip content={`${user.name} · ${ROLE_LABEL[user.role]} — çıkış yap`}>
            <button
              type="button"
              onClick={async () => router.push(await logout())}
              className="hidden h-8 items-center gap-2 border border-rule-soft px-2 text-dense text-ink-soft hover:border-ink hover:text-ink sm:inline-flex"
              aria-label={`${user.name}, ${ROLE_LABEL[user.role]}. Çıkış yap`}
            >
              <span className="text-[12px] font-medium leading-none text-ink">{ROLE_CODE[user.role]}</span>
              <span className="hidden xl:inline">Çıkış</span>
            </button>
          </Tooltip>
        </div>
      </div>
      <div className="flex h-8 items-center overflow-x-auto border-t border-hairline px-3 lg:hidden">
        <CountersLine />
      </div>
    </header>
  );
}
