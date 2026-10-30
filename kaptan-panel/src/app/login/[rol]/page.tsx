import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { safeNext } from "@/lib/nav";
import { ROLE_LABEL } from "@/lib/domain/role-meta";
import { roleFromSlug } from "@/lib/auth/role-doors";
import { isSingleUser } from "@/lib/solo/mode.server";
import { SoloLoginScreen } from "@/components/solo/solo-login";
import { LoginScreen } from "../login-screen";

type Props = { params: Promise<{ rol: string }>; searchParams: Promise<{ next?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const role = roleFromSlug((await params).rol);
  return { title: role ? `${ROLE_LABEL[role]} girişi` : "Giriş" };
}

/** /login/<rol> — the same sign-in screen with that team account already chosen; unknown → 404. */
export default async function RoleLoginPage({ params, searchParams }: Props) {
  const [{ rol }, { next }] = await Promise.all([params, searchParams]);
  const role = roleFromSlug(rol);
  if (!role) notFound();
  // Single-user mode has no team accounts: every door is the one password field.
  if (await isSingleUser()) return <SoloLoginScreen next={safeNext(next)} />;
  return <LoginScreen next={safeNext(next)} initialRole={role} />;
}
