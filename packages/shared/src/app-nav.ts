export const APP_NAV_POLICY_VERSION = "app_nav_v1" as const;

export type ApprovalCountBadgeSource = {
  attentionTotal: number;
} | null | undefined;

/**
 * Compact approval-count text for the shell badge and Approvals row.
 * Missing or non-finite totals are the word "Approvals", never "?".
 * Known totals are the number so a 390px badge stays a word or digit.
 */
export function approvalCountBadgeText(counts: ApprovalCountBadgeSource): string {
  const total = counts?.attentionTotal;
  if (typeof total !== "number" || !Number.isFinite(total)) return "Approvals";
  return String(total);
}

export type AppNavLink = {
  href: string;
  label: string;
};

export const APP_NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/manager", label: "Manager" },
  { href: "/operations", label: "Band operations" },
  { href: "/venues", label: "Venues" },
  { href: "/contacts", label: "Contacts" },
  { href: "/booking", label: "Booking" },
  { href: "/prospects", label: "Find shows" },
  { href: "/market-sprints", label: "Market sprints" },
  { href: "/booking-campaigns", label: "Pitch campaigns" },
  { href: "/booking-inbox", label: "Booking inbox" },
  { href: "/tasks", label: "Tasks" },
  { href: "/approvals", label: "Approvals" },
  { href: "/summary", label: "Weekly summary" },
  { href: "/notifications", label: "Notifications" },
  { href: "/activity", label: "Activity" }
] as const satisfies readonly AppNavLink[];

export const APP_NAV_BOOKING_CLUSTER = [
  { href: "/venues", label: "Venues" },
  { href: "/contacts", label: "Contacts" },
  { href: "/booking", label: "Booking" },
  { href: "/prospects", label: "Find shows" },
  { href: "/market-sprints", label: "Market sprints" },
  { href: "/booking-campaigns", label: "Pitch campaigns" },
  { href: "/booking-inbox", label: "Booking inbox" }
] as const satisfies readonly AppNavLink[];

export const APP_NAV_MORE_CLUSTER = [
  { href: "/notifications", label: "Notifications" },
  { href: "/activity", label: "Activity" }
] as const satisfies readonly AppNavLink[];

export type MobileNavScreen = "root" | "booking" | "more";

export type MobileNavRootItem =
  | { kind: "link"; href: string; label: string }
  | { kind: "cluster"; id: Exclude<MobileNavScreen, "root">; label: string };

export const APP_NAV_MOBILE_ROOT = [
  { kind: "link", href: "/dashboard", label: "Dashboard" },
  { kind: "link", href: "/manager", label: "Manager" },
  { kind: "link", href: "/operations", label: "Band operations" },
  { kind: "cluster", id: "booking", label: "Booking" },
  { kind: "link", href: "/tasks", label: "Tasks" },
  { kind: "link", href: "/approvals", label: "Approvals" },
  { kind: "link", href: "/summary", label: "Weekly summary" },
  { kind: "cluster", id: "more", label: "More" }
] as const satisfies readonly MobileNavRootItem[];

export const APP_NAV_MOBILE_ROOT_MAX_ROWS = 8;

export function mobileNavRootRows(): MobileNavRootItem[] {
  return APP_NAV_MOBILE_ROOT.map((item) =>
    item.kind === "link"
      ? { kind: "link", href: item.href, label: item.label }
      : { kind: "cluster", id: item.id, label: item.label }
  );
}

export function mobileNavClusterRows(
  screen: Exclude<MobileNavScreen, "root">,
  showTeamLink = false
): AppNavLink[] {
  const rows: AppNavLink[] =
    screen === "booking"
      ? APP_NAV_BOOKING_CLUSTER.map((item) => ({ href: item.href, label: item.label }))
      : APP_NAV_MORE_CLUSTER.map((item) => ({ href: item.href, label: item.label }));
  if (screen === "more" && showTeamLink) {
    rows.push({ href: "/team", label: "Team" });
  }
  return rows;
}

export function mobileNavClusterActive(
  screen: Exclude<MobileNavScreen, "root">,
  pathname: string | null,
  showTeamLink = false
): boolean {
  return mobileNavClusterRows(screen, showTeamLink).some((item) => navPathActive(item.href, pathname));
}

export function navPathActive(href: string, pathname: string | null): boolean {
  if (!pathname) return false;
  if (href === "/dashboard") return pathname === "/dashboard" || pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
