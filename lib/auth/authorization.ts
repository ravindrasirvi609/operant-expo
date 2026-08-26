import { notFound, unauthorized } from "next/navigation";

import { getOrganizationContext } from "@/lib/auth/tenant";
import { roleHasPermission } from "@/lib/permissions";

export async function requireOrganizationContext(organizationId: string) {
  const context = await getOrganizationContext(organizationId);
  if (!context) unauthorized();
  return context;
}

export async function requireOrganizationPermission(
  organizationId: string,
  permission: string,
) {
  const context = await requireOrganizationContext(organizationId);
  if (!roleHasPermission(context.membership.role, permission)) notFound();
  return context;
}

