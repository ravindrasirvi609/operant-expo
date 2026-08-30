"use client";

import { useEffect, useState } from "react";

import { SectionEyebrow } from "@/components/ui/section-eyebrow";
import { parseJsonResponse } from "@/lib/http/client";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function BookingPage({ params }: { params: Promise<{ exhibitionSlug: string; stallId: string }> }) {
  const [ids, setIds] = useState<{ exhibitionSlug: string; stallId: string } | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { void params.then(setIds); }, [params]);
  useEffect(() => {
    if (!ids) return;
    fetch(`/api/public/exhibitions/${ids.exhibitionSlug}/stalls/${ids.stallId}/hold`, { method: "POST" })
      .then(async (response) => {
        const data = await parseJsonResponse<{ error?: string; hold?: { expiresAt: string } }>(response);
        if (!response.ok || data.error || !data.hold) throw new Error(data.error ?? "Unable to reserve stall");
        setExpiresAt(new Date(data.hold.expiresAt).getTime());
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to reserve stall"));
  }, [ids]);
  useEffect(() => {
    if (!expiresAt) return;
    const timer = setInterval(() => setSeconds(Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))), 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  function validate(data: Record<string, FormDataEntryValue>) {
    const nextErrors: Record<string, string> = {};
    if (!String(data.companyName ?? "").trim()) nextErrors.companyName = "Company name is required.";
    if (!String(data.contactPerson ?? "").trim()) nextErrors.contactPerson = "Contact person is required.";
    if (!EMAIL_PATTERN.test(String(data.email ?? ""))) nextErrors.email = "Enter a valid email address.";
    return nextErrors;
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ids || seconds === 0) return setError("Reservation expired — go back and select the stall again.");
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const validationErrors = validate(data);
    setFieldErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    setSubmitting(true);
    setError("");
    const idempotencyKey = crypto.randomUUID();
    const response = await fetch(`/api/public/exhibitions/${ids.exhibitionSlug}/bookings`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey }, body: JSON.stringify({ ...data, stallId: ids.stallId }) });
    const result = await parseJsonResponse<{ error?: string; booking?: { bookingNumber: string } }>(response);
    setSubmitting(false);
    if (!response.ok || result.error || !result.booking) setError(result.error ?? "Booking failed");
    else setMessage(`Booking ${result.booking.bookingNumber} created. We'll confirm once payment is received.`);
  }

  return (
    <main className="mx-auto max-w-md px-6 py-12">
      <SectionEyebrow>Reserve your space</SectionEyebrow>
      <h1 className="mt-2 font-display text-3xl font-semibold text-[var(--ink)]">Exhibitor booking</h1>

      {expiresAt && !message && (
        <div className="mt-4 flex items-center justify-between rounded-md border border-[var(--status-held)] bg-[color-mix(in_srgb,var(--status-held)_10%,transparent)] px-4 py-3">
          <span className="text-sm text-[var(--ink)]">Stall held for</span>
          <span className="font-mono text-lg font-semibold tabular text-[var(--status-held)]">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</span>
        </div>
      )}
      {error && <p role="alert" className="mt-3 rounded-md border border-[var(--status-booked)] bg-[color-mix(in_srgb,var(--status-booked)_10%,transparent)] p-3 text-sm text-[var(--status-booked)]">{error}</p>}

      {message ? (
        <p className="mt-6 rounded-md border border-[var(--status-available)] bg-[color-mix(in_srgb,var(--status-available)_10%,transparent)] p-4 text-[var(--status-available)]">{message}</p>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-3">
          <div>
            <input name="companyName" required placeholder="Company name" className="w-full rounded-md border border-[var(--line-strong)] bg-transparent p-3" />
            {fieldErrors.companyName && <p className="mt-1 text-xs text-[var(--status-booked)]">{fieldErrors.companyName}</p>}
          </div>
          <div>
            <input name="contactPerson" required placeholder="Contact person" className="w-full rounded-md border border-[var(--line-strong)] bg-transparent p-3" />
            {fieldErrors.contactPerson && <p className="mt-1 text-xs text-[var(--status-booked)]">{fieldErrors.contactPerson}</p>}
          </div>
          <div>
            <input name="email" required type="email" placeholder="Email" className="w-full rounded-md border border-[var(--line-strong)] bg-transparent p-3" />
            {fieldErrors.email && <p className="mt-1 text-xs text-[var(--status-booked)]">{fieldErrors.email}</p>}
          </div>
          <input name="phone" placeholder="Phone" className="w-full rounded-md border border-[var(--line-strong)] bg-transparent p-3" />
          <textarea name="address" placeholder="Address" className="w-full rounded-md border border-[var(--line-strong)] bg-transparent p-3" />
          <button disabled={!expiresAt || seconds === 0 || submitting} className="w-full rounded-md bg-[var(--brand)] p-3 font-medium text-[var(--brand-ink)] disabled:opacity-50">
            {submitting ? "Submitting…" : "Submit booking"}
          </button>
        </form>
      )}
    </main>
  );
}
