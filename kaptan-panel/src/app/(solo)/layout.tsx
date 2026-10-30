import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { API_MODE } from "@/lib/api/config";
import { decodeSession, SESSION_COOKIE } from "@/lib/auth/session";
import { SOLO_HOME } from "@/lib/solo/mode";
import { SoloHttpBoot, SoloShell } from "@/components/solo/solo-shell";

/**
 * The single-user area ("Benim KAPtan'ım"). Mock: the session cookie, checked again after the
 * proxy. Http: the person comes from GET /me on the client (the JWT lives in memory only).
 */
export default async function SoloLayout({ children }: { children: React.ReactNode }) {
  if (API_MODE === "http") return <SoloHttpBoot>{children}</SoloHttpBoot>;
  const session = decodeSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) redirect(`/login?next=${encodeURIComponent(SOLO_HOME)}`);
  return <SoloShell user={{ uid: session.uid, name: session.name, role: session.role }}>{children}</SoloShell>;
}
