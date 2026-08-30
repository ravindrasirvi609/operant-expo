"use client";

import { useEffect, useState } from "react";

import { SectionEyebrow } from "@/components/ui/section-eyebrow";
import { DimensionDivider } from "@/components/ui/dimension-divider";

type Organization = { _id: string; name: string };
type Hold = {
  _id: string;
  expiresAt: string;
  createdAt: string;
  stall: { stallNumber: string; basePrice: number; currency: string } | null;
  exhibition: { name: string; slug: string } | null;
};

function Countdown({ expiresAt }: { expiresAt: string }) {
  const [seconds, setSeconds] = useState(() => Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)));
  useEffect(() => {
    const timer = setInterval(() => setSeconds(Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))), 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);
  const expired = seconds === 0;
  return (
    <span className={`font-mono tabular text-sm ${expired ? "text-[var(--ink-faint)]" : "text-[var(--status-held)]"}`}>
      {expired ? "expiring…" : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`}
    </span>
  );
}

export default function HoldsPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [holds, setHolds] = useState<Hold[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load(id: string) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/organizations/${id}/holds`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load holds");
      setHolds(data.holds);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load holds");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetch("/api/me/organizations")
      .then((response) => response.json())
      .then((data) => {
        setOrganizations(data.organizations ?? []);
        const first = data.organizations?.[0];
        if (first) {
          setOrganizationId(first._id);
          void load(first._id);
        } else setLoading(false);
      })
      .catch(() => {
        setError("Unable to load organizations");
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!organizationId) return;
    const interval = setInterval(() => void load(organizationId), 15_000);
    return () => clearInterval(interval);
  }, [organizationId]);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <SectionEyebrow>Organizer workspace</SectionEyebrow>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-[var(--ink)]">Live holds</h1>
          <p className="mt-2 text-[var(--ink-soft)]">Stalls currently reserved by a visitor while they complete their booking. Refreshes automatically.</p>
        </div>
        <select value={organizationId} onChange={(event) => { setOrganizationId(event.target.value); void load(event.target.value); }} className="rounded-md border border-[var(--line-strong)] bg-[var(--paper-raised)] px-3 py-2 text-sm">
          {organizations.map((organization) => <option key={organization._id} value={organization._id}>{organization.name}</option>)}
        </select>
      </div>
      <DimensionDivider className="mt-6" />

      {error && <p role="alert" className="mt-5 rounded-md border border-[var(--status-booked)] bg-[color-mix(in_srgb,var(--status-booked)_10%,transparent)] p-3 text-sm text-[var(--status-booked)]">{error}</p>}

      <section className="mt-6 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--paper-raised)]">
        {loading ? (
          <div className="p-8 text-[var(--ink-soft)]">Loading holds…</div>
        ) : holds.length === 0 ? (
          <div className="p-10 text-center text-[var(--ink-soft)]">No active holds right now — visitors haven&apos;t reserved a stall yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[var(--line)] text-[var(--ink-soft)]">
                <tr>
                  <th className="px-5 py-3">Stall</th>
                  <th className="px-5 py-3">Exhibition</th>
                  <th className="px-5 py-3">Price</th>
                  <th className="px-5 py-3">Held since</th>
                  <th className="px-5 py-3 text-right">Time left</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {holds.map((hold) => (
                  <tr key={hold._id}>
                    <td className="px-5 py-4 font-mono font-medium text-[var(--ink)]">{hold.stall?.stallNumber ?? "—"}</td>
                    <td className="px-5 py-4 text-[var(--ink-soft)]">{hold.exhibition?.name ?? "—"}</td>
                    <td className="px-5 py-4 font-mono tabular">{hold.stall ? `${hold.stall.basePrice.toLocaleString()} ${hold.stall.currency}` : "—"}</td>
                    <td className="px-5 py-4 text-[var(--ink-soft)]">{new Date(hold.createdAt).toLocaleTimeString()}</td>
                    <td className="px-5 py-4 text-right"><Countdown expiresAt={hold.expiresAt} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
