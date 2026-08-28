import { redirect } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";

import { getCurrentUser } from "@/lib/auth/session";
import { NavLinks } from "@/components/dashboard/nav-links";

export default async function DashboardLayout({ children }: Readonly<{ children: ReactNode }>) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <div className="min-h-screen bg-[var(--paper)]">
      <header className="flex items-center justify-between border-b border-[var(--line)] bg-[var(--paper-raised)] px-6 py-3">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="flex items-center gap-2 font-display text-base font-semibold text-[var(--ink)]">
            <span className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--ink)] bg-[var(--ink)] font-mono text-xs text-[var(--paper)]">OE</span>
            Operant Expo
          </Link>
          <NavLinks />
        </div>
        <div className="flex items-center gap-4">
          <Link href="/dashboard/organizations/new" className="text-sm font-medium text-[var(--accent-ink)] dark:text-[var(--accent)]">+ Organization</Link>
          <span className="font-mono text-xs text-[var(--ink-soft)]">{user.email}</span>
        </div>
      </header>
      {children}
    </div>
  );
}
