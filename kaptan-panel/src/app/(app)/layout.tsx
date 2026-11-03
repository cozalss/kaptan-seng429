import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { API_MODE } from "@/lib/api/config";
import { decodeSession, SESSION_COOKIE } from "@/lib/auth/session";
import { HOME } from "@/lib/nav";
import { HowItWorks } from "@/components/onboarding/how-it-works";
import { HttpBoot, SoloShell } from "@/components/solo/solo-shell";

/**
 * The signed-in app. The person comes from GET /me on the client (the JWT lives in memory only);
 * the test double reads its session cookie, checked again after the proxy.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (API_MODE === "http") return (
      <HttpBoot>
        {children}
        <HowItWorks />
      </HttpBoot>
    );
  const session = decodeSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) redirect(`/login?next=${encodeURIComponent(HOME)}`);
  return (
    <SoloShell user={{ uid: session.uid, name: session.name }}>
      {children}
      <HowItWorks />
    </SoloShell>
  );
}
