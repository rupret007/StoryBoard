"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Bell,
  BrainCircuit,
  Building2,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Compass,
  Ellipsis,
  LayoutDashboard,
  ListTodo,
  MailSearch,
  MapPinned,
  Menu,
  ShieldCheck,
  Sparkles,
  SquareKanban,
  UserCog,
  Users,
  X
} from "lucide-react";
import { useEffect, useId, useRef, useState, type ComponentType } from "react";
import {
  APP_NAV_LINKS,
  approvalCountBadgeText,
  mobileNavClusterActive,
  mobileNavClusterRows,
  mobileNavRootRows,
  navPathActive,
  type MobileNavScreen
} from "@storyboard/shared";
import { OperatorSession } from "@/components/operator-session";
import type { ApprovalLifecycleCounts } from "@/lib/types";

const navIcons: Record<string, ComponentType<{ className?: string }>> = {
  "/dashboard": LayoutDashboard,
  "/manager": BrainCircuit,
  "/operations": CalendarRange,
  "/venues": Building2,
  "/contacts": Users,
  "/booking": SquareKanban,
  "/prospects": Compass,
  "/market-sprints": MapPinned,
  "/booking-campaigns": CalendarRange,
  "/booking-inbox": MailSearch,
  "/tasks": ListTodo,
  "/approvals": ShieldCheck,
  "/summary": CalendarRange,
  "/notifications": Bell,
  "/activity": Activity,
  "/team": UserCog
};

type SidebarProps = {
  approvalAttention: ApprovalLifecycleCounts | null;
  operatorEmail?: string;
  memberships: { artistId: string; artistName: string }[];
  currentArtistId: string | null;
  showTeamLink?: boolean;
};

function attentionTone(counts: ApprovalLifecycleCounts | null) {
  if (!counts) return "border-slate-500/30 bg-slate-500/10 text-slate-300";
  if (counts.needsReconciliation > 0) return "border-red-500/30 bg-red-500/15 text-red-200";
  if (counts.readyToExecute > 0) return "border-cyan-500/30 bg-cyan-500/15 text-cyan-100";
  return "border-amber-500/30 bg-amber-500/15 text-amber-200";
}

function attentionLabel(counts: ApprovalLifecycleCounts | null) {
  if (!counts) return "Approval status unavailable";
  if (counts.attentionTotal === 0) return "No approval work needs attention";
  return `${counts.attentionTotal} approval item${counts.attentionTotal === 1 ? "" : "s"} need attention: ${counts.needsReconciliation} reconciliation, ${counts.pendingDecision} decisions, ${counts.readyToExecute} ready to execute`;
}

function navItemClass(active: boolean) {
  return [
    "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
    active
      ? "bg-[var(--accent-muted)] text-[var(--accent)]"
      : "text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]"
  ].join(" ");
}

function NavIcon({ href }: { href: string }) {
  const Icon = navIcons[href] ?? SquareKanban;
  return <Icon className="h-4 w-4 shrink-0 opacity-80" aria-hidden />;
}

function ApprovalCountBadge({
  approvalAttention
}: {
  approvalAttention: ApprovalLifecycleCounts | null;
}) {
  return (
    <span
      data-testid="approval-count-badge"
      className={`whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-semibold ${attentionTone(approvalAttention)}`}
      aria-label={attentionLabel(approvalAttention)}
      title={attentionLabel(approvalAttention)}
    >
      {approvalCountBadgeText(approvalAttention)}
    </span>
  );
}

function NavLinkRow({
  href,
  label,
  pathname,
  approvalAttention,
  onNavigate
}: {
  href: string;
  label: string;
  pathname: string | null;
  approvalAttention: ApprovalLifecycleCounts | null;
  onNavigate?: () => void;
}) {
  const active = navPathActive(href, pathname);
  const showApprovalBadge = href === "/approvals" && (!approvalAttention || approvalAttention.attentionTotal > 0);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      {...(onNavigate ? { onClick: onNavigate } : {})}
      className={navItemClass(active)}
    >
      <NavIcon href={href} />
      <span className="flex-1 truncate">{label}</span>
      {showApprovalBadge ? <ApprovalCountBadge approvalAttention={approvalAttention} /> : null}
    </Link>
  );
}

function NavigationLinks({
  approvalAttention,
  showTeamLink,
  onNavigate,
  variant = "desktop",
  screen = "root",
  onOpenCluster
}: {
  approvalAttention: ApprovalLifecycleCounts | null;
  showTeamLink?: boolean;
  onNavigate?: () => void;
  variant?: "desktop" | "mobile";
  screen?: MobileNavScreen;
  onOpenCluster?: (screen: Exclude<MobileNavScreen, "root">) => void;
}) {
  const pathname = usePathname();

  if (variant === "mobile" && screen !== "root") {
    return (
      <nav className="space-y-0.5" aria-label={screen === "booking" ? "Booking" : "More"} data-testid={`mobile-nav-${screen}-rows`}>
        {mobileNavClusterRows(screen, Boolean(showTeamLink)).map((item) => (
          <NavLinkRow
            key={item.href}
            href={item.href}
            label={item.label}
            pathname={pathname}
            approvalAttention={approvalAttention}
            {...(onNavigate ? { onNavigate } : {})}
          />
        ))}
      </nav>
    );
  }

  if (variant === "mobile") {
    return (
      <nav className="space-y-0.5" aria-label="Main" data-testid="mobile-nav-root-rows">
        {mobileNavRootRows().map((item) => {
          if (item.kind === "cluster") {
            const active = mobileNavClusterActive(item.id, pathname, Boolean(showTeamLink));
            const Icon = item.id === "booking" ? SquareKanban : Ellipsis;
            return (
              <button
                key={item.id}
                type="button"
                aria-haspopup="true"
                aria-expanded={false}
                className={`w-full ${navItemClass(active)}`}
                onClick={() => onOpenCluster?.(item.id)}
              >
                <Icon className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                <span className="flex-1 truncate text-left">{item.label}</span>
                <ChevronRight className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
              </button>
            );
          }
          return (
            <NavLinkRow
              key={item.href}
              href={item.href}
              label={item.label}
              pathname={pathname}
              approvalAttention={approvalAttention}
              {...(onNavigate ? { onNavigate } : {})}
            />
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="space-y-0.5" aria-label="Main">
      {APP_NAV_LINKS.map((item) => (
        <NavLinkRow
          key={item.href}
          href={item.href}
          label={item.label}
          pathname={pathname}
          approvalAttention={approvalAttention}
          {...(onNavigate ? { onNavigate } : {})}
        />
      ))}
      {showTeamLink ? (
        <NavLinkRow
          href="/team"
          label="Team"
          pathname={pathname}
          approvalAttention={approvalAttention}
          {...(onNavigate ? { onNavigate } : {})}
        />
      ) : null}
    </nav>
  );
}

function ApprovalAttentionSummary({ approvalAttention, onNavigate }: { approvalAttention: ApprovalLifecycleCounts | null; onNavigate?: () => void }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-0)] px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Approvals</p>
      {!approvalAttention ? (
        <p className="mt-1 text-sm font-semibold text-slate-300">Status unavailable</p>
      ) : approvalAttention.attentionTotal === 0 ? (
        <p className="mt-1 text-sm text-[var(--text-secondary)]">No approval work needs attention.</p>
      ) : (
        <dl className="mt-2 grid grid-cols-3 gap-1 text-center">
          <div className="rounded-md bg-red-500/10 px-1 py-1.5"><dt className="text-[11px] uppercase tracking-wide text-red-200/75">Reconcile</dt><dd className="mt-0.5 font-mono text-sm font-semibold text-red-200">{approvalAttention.needsReconciliation}</dd></div>
          <div className="rounded-md bg-amber-500/10 px-1 py-1.5"><dt className="text-[11px] uppercase tracking-wide text-amber-200/75">Decide</dt><dd className="mt-0.5 font-mono text-sm font-semibold text-amber-200">{approvalAttention.pendingDecision}</dd></div>
          <div className="rounded-md bg-cyan-500/10 px-1 py-1.5"><dt className="text-[11px] uppercase tracking-wide text-cyan-100/75">Execute</dt><dd className="mt-0.5 font-mono text-sm font-semibold text-cyan-100">{approvalAttention.readyToExecute}</dd></div>
        </dl>
      )}
      <Link href="/approvals" {...(onNavigate ? { onClick: onNavigate } : {})} className="mt-2 inline-block text-xs font-medium text-[var(--accent)] hover:text-[var(--accent-hover)]">
        Open approval center
      </Link>
    </div>
  );
}

export function AppSidebar({ approvalAttention, operatorEmail, memberships, currentArtistId, showTeamLink }: SidebarProps) {
  const bandName = memberships.find((band) => band.artistId === currentArtistId)?.artistName ?? memberships[0]?.artistName ?? "Choose a band";
  return (
    <aside className="sticky top-0 hidden h-screen w-[260px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface-1)] lg:flex">
      <div className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-muted)] text-[var(--accent)]"><Sparkles className="h-5 w-5" aria-hidden /></div>
        <div className="min-w-0"><p className="truncate text-sm font-semibold tracking-tight text-[var(--text-primary)]">StoryBoard</p><p className="truncate text-xs text-[var(--text-muted)]" title={bandName}>{bandName}</p></div>
      </div>
      <div className="flex-1 overflow-y-auto p-3"><NavigationLinks approvalAttention={approvalAttention} {...(showTeamLink ? { showTeamLink: true } : {})} /></div>
      {operatorEmail ? <OperatorSession email={operatorEmail} memberships={memberships} currentArtistId={currentArtistId} /> : null}
      <div className="border-t border-[var(--border)] p-4"><ApprovalAttentionSummary approvalAttention={approvalAttention} /></div>
    </aside>
  );
}

export function MobileAppNav({ approvalAttention, operatorEmail, memberships, currentArtistId, showTeamLink }: SidebarProps) {
  const bandName = memberships.find((band) => band.artistId === currentArtistId)?.artistName ?? memberships[0]?.artistName ?? "Choose a band";
  const [open, setOpen] = useState(false);
  const [navScreen, setNavScreen] = useState<MobileNavScreen>("root");
  const dialogId = useId();
  const dialogTitleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const mobileLabel = attentionLabel(approvalAttention);
  const headerBadge = approvalCountBadgeText(approvalAttention);

  useEffect(() => {
    const desktopViewport = window.matchMedia("(min-width: 1024px)");
    const closeAtDesktopBreakpoint = () => {
      if (desktopViewport.matches) setOpen(false);
    };

    closeAtDesktopBreakpoint();
    desktopViewport.addEventListener("change", closeAtDesktopBreakpoint);
    return () => desktopViewport.removeEventListener("change", closeAtDesktopBreakpoint);
  }, []);

  useEffect(() => {
    if (!open) {
      setNavScreen("root");
      return;
    }
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : triggerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
      else triggerRef.current?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open || navScreen === "root") return;
    const frame = window.requestAnimationFrame(() => backButtonRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open, navScreen]);

  return (
    <>
      <header className="sticky top-0 z-20 -mx-4 mb-5 flex min-h-16 items-center justify-between border-b border-[var(--border)] bg-[var(--canvas)]/95 px-4 backdrop-blur lg:hidden">
        <div className="min-w-0 flex-1 pr-3"><p className="text-sm font-semibold text-[var(--text-primary)]">StoryBoard</p><p className="truncate text-xs text-[var(--text-muted)]" title={bandName}>{bandName}</p></div>
        <div className="flex shrink-0 items-center gap-2">
          <Link href="/approvals" aria-label={mobileLabel} title={mobileLabel} className={`inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-lg border px-2 text-xs font-semibold ${approvalAttention?.attentionTotal === 0 ? "border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-muted)]" : attentionTone(approvalAttention)}`}>
            <ShieldCheck className="h-4 w-4" aria-hidden />
            <span data-testid="approval-count-badge" className="whitespace-nowrap">{headerBadge}</span>
          </Link>
          <button ref={triggerRef} type="button" aria-label="Open navigation" aria-haspopup="dialog" aria-expanded={open} aria-controls={dialogId} className="sb-btn-secondary min-h-11 min-w-11 px-3" onClick={() => setOpen(true)}><Menu className="h-5 w-5" aria-hidden /></button>
        </div>
      </header>
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" tabIndex={-1} aria-label="Close navigation" className="absolute inset-0 bg-black/65" onClick={() => setOpen(false)} />
          <aside ref={dialogRef} id={dialogId} role="dialog" aria-modal="true" aria-labelledby={dialogTitleId} tabIndex={-1} className="relative flex h-full w-[min(88vw,340px)] flex-col bg-[var(--surface-1)] p-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between gap-2">
              {navScreen === "root" ? (
                <p id={dialogTitleId} className="font-semibold">Navigation</p>
              ) : (
                <>
                  <p id={dialogTitleId} className="sr-only">Navigation</p>
                  <button
                    ref={backButtonRef}
                    type="button"
                    className="sb-btn-ghost min-h-11 px-2"
                    onClick={() => setNavScreen("root")}
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden />
                    Back to main navigation
                  </button>
                </>
              )}
              <button ref={closeButtonRef} type="button" aria-label="Close navigation" className="sb-btn-ghost min-h-11 min-w-11" onClick={() => setOpen(false)}><X className="h-5 w-5" aria-hidden /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <NavigationLinks
                approvalAttention={approvalAttention}
                variant="mobile"
                screen={navScreen}
                {...(showTeamLink ? { showTeamLink: true } : {})}
                onNavigate={() => setOpen(false)}
                onOpenCluster={(nextScreen) => setNavScreen(nextScreen)}
              />
            </div>
            <div className="mt-3"><ApprovalAttentionSummary approvalAttention={approvalAttention} onNavigate={() => setOpen(false)} /></div>
            {operatorEmail ? <OperatorSession email={operatorEmail} memberships={memberships} currentArtistId={currentArtistId} /> : null}
          </aside>
        </div>
      ) : null}
    </>
  );
}
