import type { Metadata } from "next";
import { safeNext } from "@/lib/nav";
import { DEFAULT_ROLE } from "@/lib/domain/user";
import { LoginScreen } from "./login-screen";

export const metadata: Metadata = { title: "Giriş" };

/** /login — one sign-in screen: choose a team account, type the passphrase. ?next= is kept. */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <LoginScreen next={safeNext(next)} initialRole={DEFAULT_ROLE} />;
}
