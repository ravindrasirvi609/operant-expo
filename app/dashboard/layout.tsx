import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import type { ReactNode } from "react";

export default async function DashboardLayout({ children }: Readonly<{ children: ReactNode }>) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <div className="min-h-screen bg-zinc-50"><header className="flex items-center justify-between border-b bg-white px-6 py-4"><nav className="flex items-center gap-5"><span className="font-semibold">Operant Expo</span><a className="text-sm text-zinc-600 hover:text-indigo-600" href="/dashboard/exhibitions">Exhibitions</a><a className="text-sm text-zinc-600 hover:text-indigo-600" href="/dashboard/bookings">Bookings</a></nav><span className="text-sm text-zinc-500">{user.email}</span></header>{children}</div>;
}
