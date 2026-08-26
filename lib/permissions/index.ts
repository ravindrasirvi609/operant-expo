import type { OrganizationRole } from "@/types/domain";

export const rolePermissions = {
  OWNER: ["organization:manage", "exhibition:manage", "map:edit", "booking:manage", "finance:view"],
  ORGANIZER_ADMIN: ["exhibition:manage", "map:edit", "booking:manage", "finance:view"],
  ORGANIZER_STAFF: ["exhibition:view", "booking:view"],
  MAP_EDITOR: ["exhibition:view", "map:edit"],
  FINANCE: ["exhibition:view", "booking:view", "finance:view", "finance:manage"],
} as const satisfies Record<OrganizationRole, readonly string[]>;

export function roleHasPermission(role: OrganizationRole, permission: string) {
  return (rolePermissions[role] as readonly string[]).includes(permission);
}
