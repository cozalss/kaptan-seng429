import Link from "next/link";
import { ROUTES } from "@/lib/nav";
import { Icon, type IconName } from "@/components/ui/icon";

const LINKS: ReadonlyArray<{ href: string; label: string; what: string; icon: IconName }> = [
  { href: ROUTES.oneriler, label: "Öneriler", what: "Her öneri ve sonucu", icon: "suggestions" },
  { href: ROUTES.takvim, label: "Takvim", what: "Yaklaşan tarihler, piyasa", icon: "calendar" },
  { href: ROUTES.portfoy, label: "Param", what: "Dağılım, son işlemler", icon: "wallet" },
  { href: ROUTES.bildirimler, label: "Okunanlar", what: "Bütün duyurular", icon: "news" },
  { href: ROUTES.gecmis, label: "Geçmiş", what: "Her kayıt", icon: "history" },
];

/** The rest of the day, one quiet link each: everything that left the home is one press away. */
export function HomeLinks() {
  return (
    <nav aria-label="Daha fazlası" className="hm-links">
      <ul>
        {LINKS.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="hm-link">
              <Icon name={l.icon} size={18} className="hm-link-icon" />
              <span className="hm-link-label">{l.label}</span>
              <span className="hm-link-what">{l.what}</span>
              <span aria-hidden className="hm-link-go">→</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
