"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DEMO_MODE } from "@/lib/api/config";
import { PageHeader } from "@/components/ui/primitives";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlay";
import { DemoPanel } from "./demo-panel";
import { RestrictedPanel } from "./restricted-panel";
import { ConfigPanel, LivePanel } from "./system-panel";
import { UniversePanel } from "./universe-panel";
import { UsersPanel } from "./users-panel";

export const ADMIN_TABS = [
  { id: "kullanicilar", label: "Kullanıcılar ve roller" },
  { id: "evren", label: "Evren" },
  { id: "engel", label: "Engel listesi" },
  { id: "sistem", label: "Config ve canlı mod" },
  { id: "demo", label: "Demo" },
] as const;
export type AdminTab = (typeof ADMIN_TABS)[number]["id"];

export function tabFromParam(raw: string | null): AdminTab {
  return ADMIN_TABS.find((t) => t.id === raw)?.id ?? (DEMO_MODE ? "demo" : "kullanicilar");
}

/** /admin (FRONTEND-SPEC §2.11) — Admin only; the proxy sends other roles to /yetkisiz. */
export function AdminScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab = tabFromParam(params.get("sekme"));
  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Sistem · yalnızca Admin"
        title="Yönetim"
        meta="Kullanıcılar, evren, ekip engel listesi, config, canlı mod anahtarları ve demo. Her değişiklik audit'e yazılır."
      />
      <Tabs value={tab} onValueChange={(v) => router.replace(`${pathname}?sekme=${v}`, { scroll: false })}>
        <TabsList aria-label="Yönetim bölümleri">
          {ADMIN_TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="kullanicilar" className="pt-6 outline-none">
          <UsersPanel />
        </TabsContent>
        <TabsContent value="evren" className="pt-6 outline-none">
          <UniversePanel />
        </TabsContent>
        <TabsContent value="engel" className="pt-6 outline-none">
          <RestrictedPanel />
        </TabsContent>
        <TabsContent value="sistem" className="space-y-6 pt-6 outline-none">
          <LivePanel />
          <ConfigPanel />
        </TabsContent>
        <TabsContent value="demo" className="pt-6 outline-none">
          <DemoPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
