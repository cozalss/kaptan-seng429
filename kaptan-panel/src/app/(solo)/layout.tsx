import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { API_MODE } from "@/lib/api/config";
import { decodeSession, SESSION_COOKIE } from "@/lib/auth/session";
import { SOLO_HOME } from "@/lib/solo/mode";
import { isSingleUser } from "@/lib/solo/mode.server";
import { SoloHttpBoot, SoloShell } from "@/components/solo/solo-shell";

/**
 * The personal area ("Benim KAPtan'ım"): the whole product in single-user mode, and the personal
 * view of the desk for any signed-in team member otherwise ("Kişisel görünüm"). Mock: the session
 * cookie, checked again after the proxy. Http: the person comes from GET /me on the client (the
 * JWT lives in memory only).
 */
export default async function SoloLayout({ children }: { children: React.ReactNode }) {
  const singleUser = await isSingleUser();
  if (API_MODE === "http") return <SoloHttpBoot singleUser={singleUser}>{children}</SoloHttpBoot>;
  const session = decodeSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) redirect(`/login?next=${encodeURIComponent(SOLO_HOME)}`);
  return (
    <SoloShell user={{ uid: session.uid, name: session.name, role: session.role }} singleUser={singleUser}>
      {children}
    </SoloShell>
  );
}
