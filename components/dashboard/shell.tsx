"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Building2, CalendarRange, Grid3x3, LayoutDashboard, LogOut, Menu, Receipt, Timer } from "lucide-react";
import { toast } from "sonner";

import { OrganizationSwitcher } from "@/components/dashboard/organization-switcher";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { apiRequest } from "@/lib/http/client";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  exact?: boolean;
};

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/exhibitions", label: "Exhibitions", icon: CalendarRange },
  { href: "/dashboard/stalls", label: "Stalls", icon: Grid3x3 },
  { href: "/dashboard/bookings", label: "Bookings", icon: Receipt },
  { href: "/dashboard/holds", label: "Holds", icon: Timer },
];

function useActivePath() {
  const pathname = usePathname() ?? "";
  return React.useCallback(
    (href: string, exact?: boolean) => (exact ? pathname === href : pathname.startsWith(href)),
    [pathname],
  );
}

function Wordmark() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2 font-display text-base font-semibold text-[var(--ink)]">
      <span className="flex size-8 items-center justify-center rounded-md bg-[var(--ink)] font-mono text-xs text-[var(--paper)]">
        OE
      </span>
      Operant Expo
    </Link>
  );
}

/**
 * Dashboard chrome: navigation, organization switcher, theme control and account menu.
 *
 * The previous header laid five nav links, an action and an email address out in a single
 * non-wrapping row, which overflowed the viewport on any phone. Below `md` the links move into a
 * sheet and only the wordmark, switcher and menu stay on the bar.
 */
export function DashboardShell({ userEmail, children }: { userEmail: string; children: React.ReactNode }) {
  const router = useRouter();
  const isActive = useActivePath();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [signingOut, setSigningOut] = React.useState(false);

  async function signOut() {
    setSigningOut(true);
    const result = await apiRequest("/api/auth/logout", { method: "POST" });
    if (!result.ok) {
      setSigningOut(false);
      toast.error(result.error);
      return;
    }
    router.push("/login");
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--paper)]">
      <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--card)_92%,transparent)] backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="iconSm" className="md:hidden" aria-label="Open navigation">
                <Menu className="size-5" aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72">
              <SheetHeader>
                <SheetTitle>Navigation</SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-1">
                {NAV.map((item) => (
                  <SheetClose asChild key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                        isActive(item.href, item.exact)
                          ? "bg-[var(--brand)] text-[var(--brand-ink)]"
                          : "text-[var(--ink-soft)] hover:bg-[var(--paper-sunken)] hover:text-[var(--ink)]",
                      )}
                    >
                      <item.icon className="size-4" aria-hidden />
                      {item.label}
                    </Link>
                  </SheetClose>
                ))}
              </nav>
            </SheetContent>
          </Sheet>

          <Wordmark />

          <nav className="hidden items-center gap-0.5 md:flex" aria-label="Dashboard">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(item.href, item.exact) ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive(item.href, item.exact)
                    ? "bg-[var(--brand)] text-[var(--brand-ink)]"
                    : "text-[var(--ink-soft)] hover:bg-[var(--paper-sunken)] hover:text-[var(--ink)]",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <OrganizationSwitcher className="hidden w-44 sm:flex" />
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="iconSm" aria-label={`Account menu for ${userEmail}`}>
                  <span className="font-mono text-xs uppercase">{userEmail.slice(0, 2)}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Signed in</DropdownMenuLabel>
                <div className="max-w-56 truncate px-2 pb-1.5 text-sm text-[var(--ink)]">{userEmail}</div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/organizations/new">
                    <Building2 aria-hidden />
                    New organization
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  disabled={signingOut}
                  onSelect={(event) => {
                    // Keep the menu mounted while the request runs so the item can show progress.
                    event.preventDefault();
                    void signOut();
                  }}
                >
                  <LogOut aria-hidden />
                  {signingOut ? "Signing out…" : "Sign out"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div className="border-t border-[var(--line)] px-4 py-2 sm:hidden">
          <OrganizationSwitcher className="w-full" />
        </div>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
