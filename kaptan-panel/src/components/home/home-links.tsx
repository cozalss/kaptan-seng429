import Link from "next/link";
import { ROUTES } from "@/lib/nav";

const LINKS: ReadonlyArray<{ href: string; label: string; what: string }> = [
  { href: ROUTES.takvim, label: "Takvim", what: "Yaklaşan tarihler, piyasa" },
  { href: ROUTES.portfoy, label: "Param", what: "Dağılım, son işlemler" },
  { href: ROUTES.bildirimler, label: "Okunanlar", what: "Bütün duyurular" },
  { href: ROUTES.gecmis, label: "Geçmiş", what: "Her kayıt" },
];

/** The rest of the day, one quiet link each: everything that left the home is one press away. */
export function HomeLinks() {
  return (
    <nav aria-label="Daha fazlası" className="hm-links">
      <ul>
        {LINKS.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="hm-link">
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
