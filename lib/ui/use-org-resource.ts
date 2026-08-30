"use client";

import * as React from "react";

import { useOrganization } from "@/components/providers/organization-provider";
import { apiGet } from "@/lib/http/client";

export type OrgResource<T> = {
  data: T | null;
  loading: boolean;
  error: string;
  reload: () => Promise<void>;
  organizationId: string;
  /** True when the membership list has loaded and the user belongs to no organization. */
  noOrganizations: boolean;
};

type Loaded<T> = { path: string; data: T | null; error: string };

/**
 * Reads an organization-scoped endpoint, following the active organization.
 *
 * Every dashboard list screen hand-rolled this: fetch the org list, take the first entry, fetch
 * its data, track three pieces of state — each with subtly different error handling, and none
 * guarding against a stale response landing after a fast organization switch.
 *
 * `loading` is derived from "the settled path is not the requested path" rather than stored, so
 * the effect never calls setState synchronously and cannot cascade an extra render.
 *
 * @param path endpoint to read, or null while the active organization is unknown.
 * @param options.refreshMs poll interval, for screens showing live countdowns.
 */
export function useOrgResource<T>(path: string | null, options: { refreshMs?: number } = {}): OrgResource<T> {
  const { organizationId, loading: organizationsLoading } = useOrganization();
  const { refreshMs } = options;

  const [loaded, setLoaded] = React.useState<Loaded<T> | null>(null);

  // Tagged per request so a response from a superseded path is discarded rather than painting
  // one organization's data under another's heading.
  const generation = React.useRef(0);

  const load = React.useCallback(async (target: string, quiet: boolean) => {
    const requestId = ++generation.current;
    const result = await apiGet<T>(target);
    if (requestId !== generation.current) return;

    setLoaded((current) => {
      if (result.ok) return { path: target, data: result.data, error: "" };
      // A failed background refresh keeps the last good data on screen; a failed first load has
      // nothing to keep.
      const previous = quiet && current?.path === target ? current.data : null;
      return { path: target, data: previous, error: result.error };
    });
  }, []);

  React.useEffect(() => {
    if (!path) return;
    void load(path, false);
  }, [path, load]);

  React.useEffect(() => {
    if (!path || !refreshMs) return;
    const timer = setInterval(() => void load(path, true), refreshMs);
    return () => clearInterval(timer);
  }, [path, refreshMs, load]);

  const reload = React.useCallback(async () => {
    if (path) await load(path, true);
  }, [path, load]);

  const settled = loaded?.path === path ? loaded : null;

  return {
    data: settled?.data ?? null,
    loading: organizationsLoading || (Boolean(path) && !settled),
    error: settled?.error ?? "",
    reload,
    organizationId,
    noOrganizations: !organizationsLoading && !organizationId,
  };
}
