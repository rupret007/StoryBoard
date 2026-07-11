"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Bell,
  Building2,
  CalendarRange,
  Compass,
  SquareKanban,
  LayoutDashboard,
  ListTodo,
  ShieldCheck,
  Sparkles,
  Users,
  UserCog
} from "lucide-react";
import { OperatorSession } from "@/components/operator-session";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/venues", label: "Venues", icon: Building2 },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/booking", label: "Booking", icon: SquareKanban },
  { href: "/prospects", label: "Find shows", icon: Compass },
  { href: "/booking-campaigns", label: "Pitch campaigns", icon: CalendarRange },
  { href: "/tasks", label: "Tasks", icon: ListTodo },
  { href: "/approvals", label: "Approvals", icon: ShieldCheck },
  { href: "/summary", label: "Weekly summary", icon: CalendarRange },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/activity", label: "Activity", icon: Activity }
] as const;

function navActive(href: string, pathname: string | null) {
  if (!pathname) {
    return false;
  }
  if (href === "/dashboard") {
    return pathname === "/dashboard" || pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppSidebar({
  pendingApprovals,
  operatorEmail,
  memberships,
  currentArtistId,
  showTeamLink
}: {
  pendingApprovals: number;
  operatorEmail?: string;
  memberships: { artistId: string; artistName: string }[];
  currentArtistId: string | null;
  showTeamLink?: boolean;
}) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 flex h-screen w-[260px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface-1)]">
      <div className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-muted)] text-[var(--accent)]">
          <Sparkles className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight text-[var(--text-primary)]">
            StoryBoard
          </p>
          <p className="truncate text-xs text-[var(--text-muted)]">
            Manager OS
          </p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3" aria-label="Main">
        {links.map(({ href, label, icon: Icon }) => {
          const active = navActive(href, pathname);
          return (
            <Link
              key={href}
              href={href}
              className={[
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-[var(--accent-muted)] text-[var(--accent)]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]"
              ].join(" ")}
            >
              <Icon className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
              <span className="flex-1 truncate">{label}</span>
              {href === "/approvals" && pendingApprovals > 0 ? (
                <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-200">
                  {pendingApprovals}
                </span>
              ) : null}
            </Link>
          );
        })}
        {showTeamLink ? (
          <Link
            href="/team"
            className={[
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              navActive("/team", pathname)
                ? "bg-[var(--accent-muted)] text-[var(--accent)]"
                : "text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]"
            ].join(" ")}
          >
            <UserCog className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
            <span className="flex-1 truncate">Team</span>
          </Link>
        ) : null}
      </nav>

      {operatorEmail ? (
        <OperatorSession
          email={operatorEmail}
          memberships={memberships}
          currentArtistId={currentArtistId}
        />
      ) : null}

      <div className="border-t border-[var(--border)] p-4">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-0)] px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Approvals
          </p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {pendingApprovals > 0 ? (
              <>
                <span className="font-semibold text-amber-200">
                  {pendingApprovals} pending
                </span>
                {" · review before sends"}
              </>
            ) : (
              "Nothing waiting — you are clear."
            )}
          </p>
          <Link
            href="/approvals"
            className="mt-2 inline-block text-xs font-medium text-[var(--accent)] hover:text-[var(--accent-hover)]"
          >
            Open center
          </Link>
        </div>
      </div>
    </aside>
  );
}
