"use client";

import * as React from "react";
import Link from "next/link";
import { Building2, FileText, Receipt } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DimensionDivider } from "@/components/ui/dimension-divider";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionEyebrow } from "@/components/ui/section-eyebrow";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useOrganization } from "@/components/providers/organization-provider";
import { apiRequest } from "@/lib/http/client";
import { useOrgResource } from "@/lib/ui/use-org-resource";

type Booking = {
  _id: string;
  bookingNumber: string;
  status: string;
  commercialSnapshot: { total: number; currency: string };
  createdAt: string;
  exhibitor: { companyName: string; contactPerson: string; email: string; phone?: string } | null;
  stall: { stallNumber: string; section?: string; stallType: string; basePrice: number } | null;
  invoiceId: string | null;
};

const FILTERS = [
  { value: "ALL", label: "All" },
  { value: "PAYMENT_PENDING", label: "Payment pending" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "CANCELLED", label: "Cancelled" },
];

function formatMoney(amount: number, currency: string) {
  return `${amount.toLocaleString()} ${currency}`;
}

export default function BookingsPage() {
  const { organizationId: activeOrganizationId } = useOrganization();
  const { data, loading, error, reload, organizationId, noOrganizations } = useOrgResource<{ bookings: Booking[] }>(
    activeOrganizationId ? `/api/organizations/${activeOrganizationId}/bookings` : null,
  );
  const [filter, setFilter] = React.useState("ALL");
  const [pendingId, setPendingId] = React.useState("");

  const bookings = React.useMemo(() => data?.bookings ?? [], [data]);
  const filtered = React.useMemo(
    () => (filter === "ALL" ? bookings : bookings.filter((booking) => booking.status === filter)),
    [bookings, filter],
  );
  const grossValue = bookings.reduce((sum, booking) => sum + (booking.commercialSnapshot?.total ?? 0), 0);
  const currency = bookings[0]?.commercialSnapshot?.currency ?? "";

  async function updateStatus(booking: Booking, status: "CONFIRMED" | "CANCELLED") {
    setPendingId(booking._id);
    const result = await apiRequest<{ booking: Booking }>(
      `/api/organizations/${organizationId}/bookings/${booking._id}`,
      { method: "PATCH", json: { status } },
    );
    setPendingId("");

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success(
      status === "CONFIRMED"
        ? `${booking.bookingNumber} confirmed. The stall is now booked.`
        : `${booking.bookingNumber} cancelled. The stall is available again.`,
    );
    // Confirming or cancelling also moves the linked stall between BOOKED and AVAILABLE, so
    // re-read from the server rather than patching this row locally and drifting out of sync.
    await reload();
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="flex flex-col gap-2">
        <SectionEyebrow>Organizer workspace</SectionEyebrow>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-[var(--ink)]">Bookings</h1>
        <p className="text-[var(--ink-soft)]">Review reservations, confirm payment, and manage commercial status.</p>
      </div>

      {error && (
        <Alert variant="destructive" className="mt-6">
          <AlertTitle>Couldn&apos;t load bookings</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {noOrganizations ? (
        <EmptyState
          className="mt-8"
          icon={Building2}
          title="No organization yet"
          description="Create an organization before taking bookings."
          action={
            <Button asChild>
              <Link href="/dashboard/organizations/new">Create organization</Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {loading ? (
              Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-28" />)
            ) : (
              <>
                <StatCard label="Total bookings" value={bookings.length} />
                <StatCard
                  label="Pending action"
                  value={bookings.filter((booking) => booking.status === "PAYMENT_PENDING").length}
                  hint="Awaiting your confirmation"
                />
                <StatCard label="Gross value" value={grossValue.toLocaleString()} hint={currency || undefined} />
              </>
            )}
          </div>

          <DimensionDivider className="mt-8" />

          <div className="mt-4 overflow-x-auto pb-1">
            <Tabs value={filter} onValueChange={setFilter}>
              <TabsList>
                {FILTERS.map((option) => {
                  const count =
                    option.value === "ALL"
                      ? bookings.length
                      : bookings.filter((booking) => booking.status === option.value).length;
                  return (
                    <TabsTrigger key={option.value} value={option.value}>
                      {option.label}
                      <span className="font-mono text-xs tabular opacity-70">{count}</span>
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </Tabs>
          </div>

          <Card className="mt-4 overflow-hidden">
            {loading ? (
              <div className="space-y-3 p-6">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-10" />
                ))}
              </div>
            ) : bookings.length === 0 ? (
              <EmptyState
                className="border-0"
                icon={Receipt}
                title="No bookings yet"
                description="Bookings appear here as soon as a visitor reserves a stall on a published floor plan and submits their details."
              />
            ) : filtered.length === 0 ? (
              <EmptyState
                className="border-0"
                icon={Receipt}
                title="Nothing matches this filter"
                description="Try a different status."
                action={
                  <Button variant="outline" onClick={() => setFilter("ALL")}>
                    Show all bookings
                  </Button>
                }
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Booking</TableHead>
                    <TableHead>Exhibitor</TableHead>
                    <TableHead>Stall</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((booking) => (
                    <TableRow key={booking._id}>
                      <TableCell className="font-mono font-medium text-[var(--ink)]">
                        {booking.bookingNumber}
                      </TableCell>
                      <TableCell>
                        {booking.exhibitor ? (
                          <>
                            <p className="font-medium text-[var(--ink)]">{booking.exhibitor.companyName}</p>
                            <p className="text-xs text-[var(--ink-soft)]">
                              {booking.exhibitor.contactPerson} · {booking.exhibitor.email}
                            </p>
                          </>
                        ) : (
                          <span className="text-[var(--ink-faint)]">—</span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-[var(--ink)]">
                        {booking.stall
                          ? `${booking.stall.stallNumber}${booking.stall.section ? ` · ${booking.stall.section}` : ""}`
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={booking.status} />
                      </TableCell>
                      <TableCell className="font-mono tabular">
                        {formatMoney(booking.commercialSnapshot.total, booking.commercialSnapshot.currency)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-[var(--ink-soft)]">
                        {new Date(booking.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          {booking.status === "PAYMENT_PENDING" && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                loading={pendingId === booking._id}
                                disabled={Boolean(pendingId)}
                                onClick={() => void updateStatus(booking, "CONFIRMED")}
                              >
                                Confirm paid
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                disabled={Boolean(pendingId)}
                                onClick={() => void updateStatus(booking, "CANCELLED")}
                              >
                                Cancel
                              </Button>
                            </>
                          )}
                          {booking.invoiceId && (
                            <Button asChild size="sm" variant="ghost">
                              <a
                                href={`/api/organizations/${organizationId}/invoices/${booking.invoiceId}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <FileText aria-hidden />
                                Invoice
                              </a>
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </>
      )}
    </main>
  );
}
