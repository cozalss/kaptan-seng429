import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { API_MODE } from "@/lib/api/config";
import { decodeSession, SESSION_COOKIE } from "@/lib/auth/session";
import { AppShell } from "@/components/shell/app-shell";
import { HttpSessionBoot } from "@/components/shell/http-session-boot";

/**
 * Signed-in area. Mock: the session cookie (validated again here, after the proxy).
 * Http: the user comes from GET /me on the client (JWT lives in memory only).
 */
export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  if (API_MODE === "http") return <HttpSessionBoot>{children}</HttpSessionBoot>;
  const session = decodeSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) redirect("/login");
  return <AppShell user={{ uid: session.uid, name: session.name }}>{children}</AppShell>;
}
