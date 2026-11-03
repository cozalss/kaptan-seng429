import type { Metadata } from "next";
import { safeNext } from "@/lib/nav";
import { SoloLoginScreen } from "@/components/solo/solo-login";

export const metadata: Metadata = { title: "Giriş" };

/** /login — one password field. ?next= is kept. */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <SoloLoginScreen next={safeNext(next)} />;
}
