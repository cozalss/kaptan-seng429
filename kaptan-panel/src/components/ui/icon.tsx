import {
  CalendarDays,
  ChevronDown,
  History,
  Keyboard,
  LifeBuoy,
  ListChecks,
  LogOut,
  Newspaper,
  Search,
  Settings,
  UserRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The panel's only icon set: twelve line icons, drawn in ink at a 1.5px stroke so they sit beside the
 * engraved boat and the Bodoni headlines instead of looking like a stock kit. Always decoration next to
 * a word (aria-hidden); a word is never replaced by an icon. Named imports only, so the rest of the
 * set never reaches the bundle.
 */
const ICONS = {
  calendar: CalendarDays,
  chevron: ChevronDown,
  history: History,
  keyboard: Keyboard,
  help: LifeBuoy,
  suggestions: ListChecks,
  logout: LogOut,
  news: Newspaper,
  search: Search,
  settings: Settings,
  person: UserRound,
  wallet: Wallet,
} as const satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

/** The stroke every icon shares: thin, like the engraving. */
export const ICON_STROKE = 1.5;

export function Icon({ name, className, size = 20 }: { name: IconName; className?: string; size?: number }) {
  const Glyph = ICONS[name];
  return <Glyph aria-hidden focusable="false" size={size} strokeWidth={ICON_STROKE} absoluteStrokeWidth className={cn("ink-icon shrink-0", className)} />;
}
