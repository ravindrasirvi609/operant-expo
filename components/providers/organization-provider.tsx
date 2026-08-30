"use client";

import * as React from "react";

import { apiGet } from "@/lib/http/client";
import type { MyOrganization } from "@/app/api/me/organizations/route";
import { roleHasPermission } from "@/lib/permissions";

const STORAGE_KEY = "operant-expo.organizationId";

type OrganizationState = {
  organizations: MyOrganization[];
  organization: MyOrganization | null;
  organizationId: string;
  selectOrganization: (organizationId: string) => void;
  /** True while the first load is in flight. Screens render skeletons on this, not on data. */
  loading: boolean;
  error: string;
  /** Re-reads the membership list — call after creating an organization. */
  refresh: () => Promise<void>;
  /** Permission check for the *selected* organization, for hiding actions the role can't do. */
  can: (permission: string) => boolean;
};

const OrganizationContext = React.createContext<OrganizationState | null>(null);

function readStoredId() {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    // Private-browsing modes can throw on access; a missing preference is not an error.
    return "";
  }
}

/**
 * Holds the membership list and the active organization for the whole dashboard.
 *
 * Every dashboard screen used to fetch `/api/me/organizations` itself and silently select
 * `organizations[0]`, so switching organization on one page had no effect on any other, and the
 * floor-plan screens instead demanded an `?organizationId=` query parameter that nothing in the
 * UI ever supplied — leaving their submit buttons permanently disabled. One provider, one
 * selection, persisted across reloads.
 */
export function OrganizationProvider({ children }: { children: React.ReactNode }) {
  const [organizations, setOrganizations] = React.useState<MyOrganization[]>([]);
  const [organizationId, setOrganizationId] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  const load = React.useCallback(async () => {
    const result = await apiGet<{ organizations: MyOrganization[] }>("/api/me/organizations");
    if (!result.ok) {
      setError(result.error);
      setLoading(false);
      return;
    }

    const list = result.data.organizations ?? [];
    setOrganizations(list);
    setError("");

    // Keep the stored selection only if it still resolves to a live membership — a revoked
    // member must not stay pinned to an organization they can no longer read.
    setOrganizationId((current) => {
      const candidate = current || readStoredId();
      const resolved = list.some((organization) => organization._id === candidate)
        ? candidate
        : (list[0]?._id ?? "");
      return resolved;
    });
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const selectOrganization = React.useCallback((next: string) => {
    setOrganizationId(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Selection still works for this session even if it can't be persisted.
    }
  }, []);

  const organization = React.useMemo(
    () => organizations.find((candidate) => candidate._id === organizationId) ?? null,
    [organizations, organizationId],
  );

  const can = React.useCallback(
    (permission: string) => (organization ? roleHasPermission(organization.role, permission) : false),
    [organization],
  );

  const value = React.useMemo<OrganizationState>(
    () => ({
      organizations,
      organization,
      organizationId,
      selectOrganization,
      loading,
      error,
      refresh: load,
      can,
    }),
    [organizations, organization, organizationId, selectOrganization, loading, error, load, can],
  );

  return <OrganizationContext.Provider value={value}>{children}</OrganizationContext.Provider>;
}

export function useOrganization() {
  const context = React.useContext(OrganizationContext);
  if (!context) {
    throw new Error("useOrganization must be used inside <OrganizationProvider>. Is this screen under app/dashboard?");
  }
  return context;
}
