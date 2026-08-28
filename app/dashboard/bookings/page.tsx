"use client";

import { useEffect, useMemo, useState } from "react";

import { SectionEyebrow } from "@/components/ui/section-eyebrow";
import { DimensionDivider } from "@/components/ui/dimension-divider";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { parseJsonResponse } from "@/lib/http/client";

type Organization = { _id: string; name: string };
type Booking = {
  _id: string;
  bookingNumber: string;
  status: string;
  stallId: string;
  exhibitorId: string;
  commercialSnapshot: { total: number; currency: string };
  createdAt: string;
  exhibitor: { companyName: string; contactPerson: string; email: string; phone?: string } | null;
  stall: { stallNumber: string; section?: string; stallType: string; basePrice: number } | null;
  invoiceId: string | null;
};

export default function BookingsPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("ALL");

  async function load(id: string) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/organizations/${id}/bookings`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load bookings");
      setBookings(data.bookings);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load bookings");
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

  async function updateStatus(bookingId: string, status: "CONFIRMED" | "CANCELLED") {
    const response = await fetch(`/api/organizations/${organizationId}/bookings/${bookingId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    const data = await parseJsonResponse<{ error?: string; booking?: Partial<Booking> }>(response);
    if (!response.ok || data.error) return setError(data.error ?? "Unable to update booking");
    setBookings((current) => current.map((booking) => (booking._id === bookingId ? { ...booking, ...data.booking } : booking)));
  }

  const filtered = useMemo(() => (filter === "ALL" ? bookings : bookings.filter((booking) => booking.status === filter)), [bookings, filter]);
  const total = bookings.reduce((sum, booking) => sum + (booking.commercialSnapshot?.total ?? 0), 0);

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <div className="flex flex-col gap-4 border-b border-[var(--line)] pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <SectionEyebrow>Organizer workspace</SectionEyebrow>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-[var(--ink)]">Bookings</h1>
          <p className="mt-2 text-[var(--ink-soft)]">Review reservations, confirm payment, and manage commercial status.</p>
        </div>
        <select aria-label="Organization" value={organizationId} onChange={(event) => { setOrganizationId(event.target.value); void load(event.target.value); }} className="rounded-md border border-[var(--line-strong)] bg-[var(--paper-raised)] px-3 py-2 text-sm">
          {organizations.map((organization) => <option key={organization._id} value={organization._id}>{organization.name}</option>)}
        </select>
      </div>

      {error && <p role="alert" className="mt-5 rounded-md border border-[var(--booked)] bg-[color-mix(in_srgb,var(--booked)_10%,transparent)] p-3 text-sm text-[var(--booked)]">{error}</p>}

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Total bookings" value={bookings.length} />
        <StatCard label="Pending action" value={bookings.filter((booking) => booking.status === "PAYMENT_PENDING").length} hint="Awaiting your confirmation" />
        <StatCard label="Gross value" value={total.toLocaleString()} />
      </div>

      <DimensionDivider className="mt-8" />

      <div className="mt-4 flex flex-wrap gap-2">
        {["ALL", "PAYMENT_PENDING", "CONFIRMED", "CANCELLED"].map((value) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`rounded-full px-3 py-1.5 text-sm ${filter === value ? "bg-[var(--accent)] text-[var(--accent-ink)]" : "border border-[var(--line-strong)] text-[var(--ink-soft)]"}`}
          >
            {value.replace("_", " ")}
          </button>
        ))}
      </div>

      <section className="mt-4 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--paper-raised)]">
        {loading ? (
          <div className="animate-pulse p-8 text-[var(--ink-soft)]">Loading bookings…</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-[var(--ink-soft)]">No bookings match this filter.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[var(--line)] text-[var(--ink-soft)]">
                <tr>
                  <th className="px-5 py-3">Booking</th>
                  <th className="px-5 py-3">Exhibitor</th>
                  <th className="px-5 py-3">Stall</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Value</th>
                  <th className="px-5 py-3">Created</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {filtered.map((booking) => (
                  <tr key={booking._id}>
                    <td className="px-5 py-4 font-mono font-medium text-[var(--ink)]">{booking.bookingNumber}</td>
                    <td className="px-5 py-4">
                      {booking.exhibitor ? (
                        <>
                          <p className="font-medium text-[var(--ink)]">{booking.exhibitor.companyName}</p>
                          <p className="text-xs text-[var(--ink-soft)]">{booking.exhibitor.contactPerson} · {booking.exhibitor.email}</p>
                        </>
                      ) : <span className="text-[var(--ink-faint)]">—</span>}
                    </td>
                    <td className="px-5 py-4 font-mono text-[var(--ink)]">{booking.stall ? `${booking.stall.stallNumber}${booking.stall.section ? ` · ${booking.stall.section}` : ""}` : "—"}</td>
                    <td className="px-5 py-4"><StatusBadge status={booking.status} /></td>
                    <td className="px-5 py-4 font-mono tabular">{booking.commercialSnapshot.total.toLocaleString()} {booking.commercialSnapshot.currency}</td>
                    <td className="px-5 py-4 text-[var(--ink-soft)]">{new Date(booking.createdAt).toLocaleDateString()}</td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        {booking.status === "PAYMENT_PENDING" && (
                          <>
                            <button onClick={() => void updateStatus(booking._id, "CONFIRMED")} className="rounded-md border border-[var(--available)] px-2.5 py-1 text-xs font-medium text-[var(--available)]">Confirm paid</button>
                            <button onClick={() => void updateStatus(booking._id, "CANCELLED")} className="rounded-md border border-[var(--booked)] px-2.5 py-1 text-xs font-medium text-[var(--booked)]">Cancel</button>
                          </>
                        )}
                        {booking.invoiceId && (
                          <a href={`/api/organizations/${organizationId}/invoices/${booking.invoiceId}`} className="rounded-md border border-[var(--line-strong)] px-2.5 py-1 text-xs font-medium text-[var(--ink)]">Invoice</a>
                        )}
                      </div>
                    </td>
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
