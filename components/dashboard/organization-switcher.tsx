"use client";

import { Building2 } from "lucide-react";

import { useOrganization } from "@/components/providers/organization-provider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

/** Switches the organization every dashboard screen reads from. */
export function OrganizationSwitcher({ className }: { className?: string }) {
  const { organizations, organizationId, selectOrganization, loading } = useOrganization();

  if (loading) return <Skeleton className="h-8 w-44" />;
  if (organizations.length === 0) return null;

  // A single organization needs no picker — showing a one-option dropdown is noise.
  if (organizations.length === 1) {
    return (
      <span className={`flex items-center gap-2 text-sm font-medium text-[var(--ink)] ${className ?? ""}`}>
        <Building2 className="size-4 text-[var(--ink-faint)]" aria-hidden />
        {organizations[0].name}
      </span>
    );
  }

  return (
    <Select value={organizationId} onValueChange={selectOrganization}>
      <SelectTrigger size="sm" className={className} aria-label="Active organization">
        <SelectValue placeholder="Select organization" />
      </SelectTrigger>
      <SelectContent>
        {organizations.map((organization) => (
          <SelectItem key={organization._id} value={organization._id}>
            {organization.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
