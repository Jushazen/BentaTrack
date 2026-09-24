"use client";

// Signed-in frame. Desktop (≥1024px): grouped sidebar. Phone/tablet: top bar + labelled bottom
// tabs + "More" sheet. Every control shows text next to its icon (SRS §2.5). Tokens and layout
// decisions: .tastemaker/style-lock.md.
import { Ellipsis, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Role } from "@/generated/prisma/enums";
import {
  PHONE_TAB_HREFS,
  isActive,
  navGroupsFor,
  pageLabel,
  type NavGroup,
  type NavItem,
} from "./nav-items";
import { SignOutButton } from "./sign-out-button";
import { ThemeToggle } from "./theme-toggle";
import { Wordmark } from "./wordmark";

type ShellUser = { name: string; role: Role };

const ROLE_LABEL: Record<Role, string> = { OWNER: "Owner", STAFF: "Staff" };

function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      className="bg-secondary text-warn ml-auto min-w-6 rounded-full px-2 py-0.5 text-center text-xs font-semibold"
      aria-label={`${count} low on stock`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

function SidebarLink({
  item,
  active,
  lowStock,
}: {
  item: NavItem;
  active: boolean;
  lowStock: number;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={[
        "relative flex min-h-11 items-center gap-3 rounded-lg px-3 text-[15px] lg:min-h-10",
        "transition-colors duration-150 ease-out",
        active
          ? "bg-secondary text-text before:bg-indicator font-medium before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full"
          : "text-muted hover:bg-bg hover:text-text",
      ].join(" ")}
    >
      <Icon aria-hidden className="size-5 shrink-0" strokeWidth={1.75} />
      <span>{item.label}</span>
      {item.lowStockBadge && <CountBadge count={lowStock} />}
    </Link>
  );
}

function NavGroups({
  groups,
  pathname,
  lowStock,
}: {
  groups: NavGroup[];
  pathname: string;
  lowStock: number;
}) {
  return (
    <>
      {groups.map((group) => (
        <div key={group.id} className="space-y-1 lg:space-y-0.5">
          <p className="text-muted px-3 pt-4 pb-1 text-xs font-semibold tracking-wider uppercase lg:pt-3">
            {group.label}
          </p>
          {group.items.map((item) => (
            <SidebarLink
              key={item.href}
              item={item}
              active={isActive(pathname, item.href)}
              lowStock={lowStock}
            />
          ))}
        </div>
      ))}
    </>
  );
}

function AccountBlock({ user }: { user: ShellUser }) {
  return (
    <div className="border-border space-y-1 border-t pt-3">
      <p className="px-3 pb-1 text-sm">
        <span className="text-text font-medium">{user.name}</span>
        <span className="text-muted"> · {ROLE_LABEL[user.role]}</span>
      </p>
      <ThemeToggle className="lg:min-h-10" />
      <SignOutButton className="lg:min-h-10" />
    </div>
  );
}

function MoreSheet({
  open,
  onClose,
  groups,
  pathname,
  lowStock,
  user,
}: {
  open: boolean;
  onClose: () => void;
  groups: NavGroup[];
  pathname: string;
  lowStock: number;
  user: ShellUser;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label="More pages"
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="bg-surface text-text mt-auto mb-0 max-h-[85dvh] w-full max-w-none rounded-t-2xl p-0 shadow-2xl backdrop:bg-black/40 open:animate-[sheet-in_220ms_var(--ease-out)]"
    >
      <div className="border-border flex items-center justify-between border-b px-4 py-3">
        <p className="font-medium">More</p>
        <button
          type="button"
          onClick={onClose}
          className="text-text hover:bg-secondary flex min-h-11 items-center gap-2 rounded-lg px-3"
        >
          <X aria-hidden className="size-5" strokeWidth={1.75} />
          <span>Close</span>
        </button>
      </div>
      <nav
        aria-label="All pages"
        className="overflow-y-auto px-2 pb-[max(env(safe-area-inset-bottom),1rem)]"
      >
        <NavGroups groups={groups} pathname={pathname} lowStock={lowStock} />
        <div className="mt-3">
          <AccountBlock user={user} />
        </div>
      </nav>
    </dialog>
  );
}

export function AppShell({
  user,
  lowStockCount,
  children,
}: {
  user: ShellUser;
  lowStockCount: number;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const groups = navGroupsFor(user.role);
  const allItems = groups.flatMap((g) => g.items);
  const tabs = PHONE_TAB_HREFS.map((href) => allItems.find((i) => i.href === href)).filter(
    (i): i is NavItem => Boolean(i),
  );
  const moreActive = !tabs.some((t) => isActive(pathname, t.href));
  // The sheet remembers the page it was opened on, so navigating anywhere closes it.
  const [moreOpenOn, setMoreOpenOn] = useState<string | null>(null);
  const moreOpen = moreOpenOn === pathname;
  const setMoreOpen = (open: boolean) => setMoreOpenOn(open ? pathname : null);
  const label = pageLabel(pathname);

  return (
    <div className="bg-bg min-h-dvh lg:flex">
      {/* Desktop sidebar */}
      <aside className="border-border bg-surface sticky top-0 hidden h-dvh w-62 shrink-0 flex-col border-r px-3 py-5 lg:flex">
        <Link
          href="/dashboard"
          className="px-3 pb-2"
          aria-label="Estetika BentaTrack, go to dashboard"
        >
          <Wordmark />
        </Link>
        <nav aria-label="Main" className="flex-1 overflow-y-auto">
          <NavGroups groups={groups} pathname={pathname} lowStock={lowStockCount} />
        </nav>
        <AccountBlock user={user} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="border-border bg-bg/95 sticky top-0 z-20 flex min-h-14 items-center gap-3 border-b px-4 backdrop-blur lg:px-8">
          <Link href="/dashboard" className="lg:hidden" aria-label="Estetika, go to dashboard">
            <Wordmark compact />
          </Link>
          <p className="text-muted text-sm">
            <span className="lg:hidden" aria-hidden>
              ·{" "}
            </span>
            {label}
          </p>
          {/* Leaf 6.2 puts the online/offline indicator here. */}
          <div id="shell-status" className="ml-auto" />
        </header>

        <main className="flex-1 px-4 pt-6 pb-28 lg:px-8 lg:pb-10">{children}</main>
      </div>

      {/* Phone/tablet bottom tabs */}
      <nav
        aria-label="Main"
        className="border-border bg-surface fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = isActive(pathname, tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`relative flex min-h-16 flex-col items-center justify-center gap-1 text-xs ${
                active ? "text-text font-semibold" : "text-muted"
              }`}
            >
              {active && (
                <span
                  aria-hidden
                  className="bg-indicator absolute inset-x-6 top-0 h-[3px] rounded-b-full"
                />
              )}
              <span className="relative">
                <Icon aria-hidden className="size-6" strokeWidth={1.75} />
                {tab.lowStockBadge && lowStockCount > 0 && (
                  <span className="bg-secondary text-warn absolute -top-1.5 -right-3 min-w-5 rounded-full px-1 text-center text-[11px] font-semibold">
                    {lowStockCount > 99 ? "99+" : lowStockCount}
                  </span>
                )}
              </span>
              <span>{tab.shortLabel ?? tab.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          className={`relative flex min-h-16 flex-col items-center justify-center gap-1 text-xs ${
            moreActive ? "text-text font-semibold" : "text-muted"
          }`}
        >
          {moreActive && (
            <span
              aria-hidden
              className="bg-indicator absolute inset-x-6 top-0 h-[3px] rounded-b-full"
            />
          )}
          <Ellipsis aria-hidden className="size-6" strokeWidth={1.75} />
          <span>More</span>
        </button>
      </nav>

      <MoreSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        groups={groups}
        pathname={pathname}
        lowStock={lowStockCount}
        user={user}
      />
    </div>
  );
}
