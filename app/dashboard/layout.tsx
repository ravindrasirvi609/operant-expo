import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import type { ReactNode } from "react";

export default async function DashboardLayout({ children }: Readonly<{ children: ReactNode }>) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <div className="min-h-screen bg-zinc-50"><header className="border-b bg-white px-6 py-4"><span className="font-semibold">Operant Expo</span><span className="ml-4 text-sm text-zinc-500">{user.email}</span></header>{children}</div>;
}
