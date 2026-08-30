import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { DashboardShell } from "@/components/dashboard/shell";
import { OrganizationProvider } from "@/components/providers/organization-provider";
import { getCurrentUser } from "@/lib/auth/session";

export default async function DashboardLayout({ children }: Readonly<{ children: ReactNode }>) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <OrganizationProvider>
      <DashboardShell userEmail={user.email}>{children}</DashboardShell>
    </OrganizationProvider>
  );
}
