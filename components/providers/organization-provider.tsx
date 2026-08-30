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
  /** Permission check for the *selected* organization, for hiding actions the role cannot do. */
  can: (permission: string) => boolean;
};

const OrganizationContext = React.createContext<OrganizationState | null>(null);

type Membership = { organizations: MyOrganization[]; error: string };

const EMPTY: MyOrganization[] = [];

function readStoredId() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    // No window during server render, and private-browsing modes can throw on access. A missing
    // preference is not an error.
    return "";
  }
}

function writeStoredId(organizationId: string) {
  try {
    window.localStorage.setItem(STORAGE_KEY, organizationId);
  } catch {
    // Selection still works for this session even if it cannot be persisted.
  }
}

async function readMembership(): Promise<Membership> {
  const result = await apiGet<{ organizations: MyOrganization[] }>("/api/me/organizations");
  return result.ok
    ? { organizations: result.data.organizations ?? [], error: "" }
    : { organizations: [], error: result.error };
}

/**
 * Holds the membership list and the active organization for the whole dashboard.
 *
 * Every dashboard screen used to fetch `/api/me/organizations` itself and silently select
 * `organizations[0]`, so switching organization on one page had no effect on any other, and the
 * floor-plan screens instead demanded an `?organizationId=` query parameter that nothing in the
 * UI ever supplied — leaving their submit buttons permanently disabled. One provider, one
 * selection, persisted across reloads.
 *
 * The active id is *derived*, not stored: an explicit choice wins, else the persisted choice if it
 * still resolves to a live membership, else the first organization. A revoked member therefore
 * cannot stay pinned to a workspace they can no longer read, and no effect writes state during
 * render to make that true.
 */
export function OrganizationProvider({ children }: { children: React.ReactNode }) {
  const [membership, setMembership] = React.useState<Membership | null>(null);
  const [chosenId, setChosenId] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    void readMembership().then((next) => {
      if (!cancelled) setMembership(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = React.useCallback(async () => {
    setMembership(await readMembership());
  }, []);

  const organizations = membership?.organizations ?? EMPTY;

  const organizationId = React.useMemo(() => {
    if (organizations.length === 0) return "";
    const exists = (candidate: string) => organizations.some((organization) => organization._id === candidate);
    if (chosenId && exists(chosenId)) return chosenId;
    const stored = readStoredId();
    if (stored && exists(stored)) return stored;
    return organizations[0]._id;
  }, [organizations, chosenId]);

  const selectOrganization = React.useCallback((next: string) => {
    setChosenId(next);
    writeStoredId(next);
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
      loading: membership === null,
      error: membership?.error ?? "",
      refresh,
      can,
    }),
    [organizations, organization, organizationId, selectOrganization, membership, refresh, can],
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
