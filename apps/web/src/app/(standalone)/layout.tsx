import { SignInGate } from "@/components/sign-in-gate";
import { ApiHttpError, serverApiFetch } from "@/lib/api-server";
import type { ReactNode } from "react";

export default async function StandaloneLayout({
  children
}: Readonly<{ children: ReactNode }>) {
  try {
    await serverApiFetch("/auth/me", { cache: "no-store" });
  } catch (e) {
    if (e instanceof ApiHttpError && e.status === 401) {
      const showDev = process.env.NODE_ENV === "development";
      return <SignInGate showDevLogin={showDev} />;
    }
  }

  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--text-primary)]">
      {children}
    </div>
  );
}
