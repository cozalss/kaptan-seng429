import type { Metadata } from "next";
import Link from "next/link";
import { Panel } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { Compass } from "@/components/brand/marks";
import { RoleRoutes } from "./role-routes";

export const metadata: Metadata = { title: "Yetki yok" };

/** Where the proxy sends a role that may not open a route (e.g. non-admin → /admin). */
export default async function Unauthorized({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams;
  return (
    <div className="mx-auto max-w-[640px] pt-6 sm:pt-12">
      <Panel raised className="p-5 sm:p-8">
        <div className="flex flex-col items-start gap-5 sm:flex-row">
          <Compass size={56} north className="shrink-0" />
          <div className="w-full min-w-0">
            <p className="text-meta text-muted">403 · Yetki yok</p>
            <h1 className="title-display mt-2 text-[34px] text-ink sm:text-[40px]">Bu rota rolünüze kapalı.</h1>
            <RoleRoutes from={from ?? null} />
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild variant="primary">
                <Link href="/login">Masaya dön</Link>
              </Button>
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}
