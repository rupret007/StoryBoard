import type { ReactNode } from "react";

export default function StandaloneLayout({
  children
}: Readonly<{ children: ReactNode }>) {
  // The onboarding page owns sign-in so it can preserve its invitation query.
  // Membership creation/acceptance still requires the API's session guard.
  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--text-primary)]">
      {children}
    </div>
  );
}
