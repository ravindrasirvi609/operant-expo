"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Timer } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SectionEyebrow } from "@/components/ui/section-eyebrow";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Stepper, type Step } from "@/components/ui/stepper";
import { Textarea } from "@/components/ui/textarea";
import { apiGet, apiRequest } from "@/lib/http/client";
import { applyApiErrors, useZodForm } from "@/lib/ui/forms";
import { exhibitorSchema } from "@/lib/validation/booking";
import { STALL_TYPE_LABELS, type STALL_TYPES } from "@/lib/validation/map";

const STEPS: Step[] = [
  { id: "review", title: "Your space", hint: "What you are reserving" },
  { id: "details", title: "Your details", hint: "Who the invoice is for" },
  { id: "done", title: "Submitted", hint: "What happens next" },
];

type StallDetail = {
  stall: {
    id: string;
    stallNumber: string;
    section?: string;
    stallType: string;
    width: number;
    height: number;
    areaLabel: string;
    basePrice: number;
    currency: string;
    amenities: string[];
    description?: string;
    hallName: string | null;
  };
  exhibition: { name: string; slug: string; lifecycle: string };
  availability: { bookable: boolean; reason: string; message: string };
  yourHold: { expiresAt: string } | null;
};

type Confirmation = {
  bookingNumber: string;
  total: number;
  currency: string;
  status: string;
  invoiceNumber?: string;
};

function money(amount: number, currency: string) {
  return `${amount.toLocaleString()} ${currency}`;
}

function remainingSeconds(expiresAt: string) {
  return Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
}

/** The hold countdown, seeded from the timestamp so it never shows a misleading 0:00 first. */
function Countdown({ expiresAt, onExpired }: { expiresAt: string; onExpired: () => void }) {
  const [seconds, setSeconds] = React.useState(() => remainingSeconds(expiresAt));

  React.useEffect(() => {
    const timer = setInterval(() => {
      const next = remainingSeconds(expiresAt);
      setSeconds(next);
      if (next === 0) onExpired();
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt]);

  const expired = seconds === 0;
  return (
    <Alert variant={expired ? "destructive" : "warning"} icon={false}>
      <div className="flex items-center justify-between gap-4">
        <span className="flex items-center gap-2 text-sm">
          <Timer className="size-4" aria-hidden />
          {expired ? "Your reservation has expired" : "Reserved for you"}
        </span>
        <span className="font-mono text-lg font-semibold tabular">
          {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
        </span>
      </div>
    </Alert>
  );
}

/**
 * The exhibitor booking flow: review, details, submitted.
 *
 * The old page was a bare form that reserved the stall the instant it loaded and never named what
 * was being bought — no stall number, no size, no price, no total. It also disabled its own submit
 * button for the first second, because the countdown started at zero and only corrected itself on
 * the first interval tick, so an early submit reported "Reservation expired" against a hold that had
 * just been created.
 */
export function BookingFlow({
  slug,
  stallId,
  bookingBasePath = "/exhibitions",
}: {
  slug: string;
  stallId: string;
  bookingBasePath?: string;
}) {
  const [detail, setDetail] = React.useState<StallDetail | null>(null);
  const [loadError, setLoadError] = React.useState("");
  const [holdExpiresAt, setHoldExpiresAt] = React.useState<string | null>(null);
  const [holdError, setHoldError] = React.useState("");
  const [reserving, setReserving] = React.useState(false);
  const [expired, setExpired] = React.useState(false);
  const [stepId, setStepId] = React.useState("review");
  const [confirmation, setConfirmation] = React.useState<Confirmation | null>(null);

  const form = useZodForm(exhibitorSchema, {
    companyName: "",
    legalName: "",
    contactPerson: "",
    email: "",
    phone: "",
    address: "",
    taxIdentifier: "",
  });
  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = form;

  const load = React.useCallback(async () => {
    const result = await apiGet<StallDetail>(`/api/public/exhibitions/${slug}/stalls/${stallId}`);
    if (!result.ok) {
      setLoadError(result.error);
      return;
    }
    setDetail(result.data);
    if (result.data.yourHold) {
      setHoldExpiresAt(result.data.yourHold.expiresAt);
      setExpired(remainingSeconds(result.data.yourHold.expiresAt) === 0);
    }
  }, [slug, stallId]);

  React.useEffect(() => {
    let cancelled = false;
    void apiGet<StallDetail>(`/api/public/exhibitions/${slug}/stalls/${stallId}`).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setLoadError(result.error);
        return;
      }
      setDetail(result.data);
      if (result.data.yourHold) {
        setHoldExpiresAt(result.data.yourHold.expiresAt);
        setExpired(remainingSeconds(result.data.yourHold.expiresAt) === 0);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [slug, stallId]);

  /** Reserving is an explicit action, so arriving here never silently takes a stall off the map. */
  async function reserve() {
    setReserving(true);
    setHoldError("");
    const result = await apiRequest<{ hold: { expiresAt: string; resumed: boolean } }>(
      `/api/public/exhibitions/${slug}/stalls/${stallId}/hold`,
      { method: "POST" },
    );
    setReserving(false);

    if (!result.ok) {
      setHoldError(result.error);
      return;
    }
    setHoldExpiresAt(result.data.hold.expiresAt);
    setExpired(false);
    setStepId("details");
  }

  const submit = handleSubmit(async (values) => {
    clearErrors("root");

    if (expired) {
      setError("root", {
        type: "server",
        message: "Your reservation expired. Reserve the stall again to continue.",
      });
      return;
    }

    const result = await apiRequest<{
      booking: Confirmation;
      invoice?: { invoiceNumber: string };
    }>(`/api/public/exhibitions/${slug}/bookings`, {
      method: "POST",
      json: { ...values, stallId },
      // A fresh key per attempt: a retry after a failure is a new attempt, while a double-click
      // within one attempt reuses this key and cannot create two bookings.
      idempotencyKey: crypto.randomUUID(),
    });

    if (!result.ok) {
      applyApiErrors(result, setError);
      // The stall may have gone while the form was open; re-read so the page tells the truth.
      await load();
      return;
    }

    setConfirmation({ ...result.data.booking, invoiceNumber: result.data.invoice?.invoiceNumber });
    setStepId("done");
    toast.success(`Booking ${result.data.booking.bookingNumber} submitted.`);
  });

  if (loadError) {
    return (
      <main className="mx-auto max-w-lg px-4 py-12 sm:px-6">
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t open this stall</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
        <Button asChild variant="outline" className="mt-6">
          <Link href={`${bookingBasePath}/${slug}`}>
            <ArrowLeft aria-hidden />
            Back to the floor plan
          </Link>
        </Button>
      </main>
    );
  }

  if (!detail) {
    return (
      <main className="mx-auto max-w-lg px-4 py-12 sm:px-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-4 h-48" />
      </main>
    );
  }

  const { stall } = detail;
  const holdActive = Boolean(holdExpiresAt) && !expired;
  const furthest = confirmation ? 2 : holdActive ? 1 : 0;

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <SectionEyebrow>Reserve your space</SectionEyebrow>
      <h1 className="mt-2 font-display text-3xl font-semibold text-[var(--ink)]">
        Stall {stall.stallNumber}
      </h1>
      <p className="mt-1 text-sm text-[var(--ink-soft)]">
        {[detail.exhibition.name, stall.hallName].filter(Boolean).join(" · ")}
      </p>

      <div className="mt-7 border-y border-[var(--line)] py-5">
        <Stepper steps={STEPS} currentId={stepId} furthestReachable={furthest} onSelect={setStepId} />
      </div>

      {holdExpiresAt && !confirmation && (
        <div className="mt-6">
          <Countdown expiresAt={holdExpiresAt} onExpired={() => setExpired(true)} />
        </div>
      )}

      {holdError && (
        <Alert variant="destructive" className="mt-6">
          <AlertTitle>Couldn&apos;t reserve this stall</AlertTitle>
          <AlertDescription>
            {holdError}
            <span className="mt-3 block">
              <Button asChild size="sm" variant="outline">
                <Link href={`${bookingBasePath}/${slug}`}>Choose another stall</Link>
              </Button>
            </span>
          </AlertDescription>
        </Alert>
      )}

      {stepId === "review" && (
        <Card className="mt-6 p-6">
          <h2 className="font-display text-lg font-semibold text-[var(--ink)]">What you are reserving</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--ink-soft)]">Stall</dt>
              <dd className="font-mono text-[var(--ink)]">
                {stall.stallNumber}
                {stall.section ? ` · section ${stall.section}` : ""}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--ink-soft)]">Size</dt>
              <dd className="font-mono text-[var(--ink)]">
                {stall.width} × {stall.height} m · {stall.areaLabel}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--ink-soft)]">Type</dt>
              <dd className="text-[var(--ink)]">
                {STALL_TYPE_LABELS[stall.stallType as (typeof STALL_TYPES)[number]] ?? stall.stallType}
              </dd>
            </div>
            {stall.amenities.length > 0 && (
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-[var(--ink-soft)]">Included</dt>
                <dd className="flex flex-wrap justify-end gap-1.5">
                  {stall.amenities.map((amenity) => (
                    <Badge key={amenity} variant="muted">
                      {amenity}
                    </Badge>
                  ))}
                </dd>
              </div>
            )}
            <Separator />
            <div className="flex items-baseline justify-between gap-4">
              <dt className="font-medium text-[var(--ink)]">Total due</dt>
              <dd className="font-display text-2xl font-semibold text-[var(--ink)]">
                {money(stall.basePrice, stall.currency)}
              </dd>
            </div>
          </dl>

          <p className="mt-4 text-xs text-[var(--ink-faint)]">
            No payment is taken here. The organizer confirms your booking once payment is arranged.
          </p>

          {holdActive ? (
            <Button size="lg" className="mt-5 w-full" onClick={() => setStepId("details")}>
              Continue to your details
            </Button>
          ) : detail.availability.bookable || expired ? (
            <Button size="lg" className="mt-5 w-full" onClick={() => void reserve()} loading={reserving}>
              {expired ? "Reserve it again" : "Reserve for 15 minutes"}
            </Button>
          ) : (
            <Alert variant="warning" className="mt-5">
              <AlertTitle>Not available</AlertTitle>
              <AlertDescription>{detail.availability.message}</AlertDescription>
            </Alert>
          )}
        </Card>
      )}

      {stepId === "details" && !confirmation && (
        <Card className="mt-6 p-6">
          <form onSubmit={submit} className="space-y-4" noValidate>
            <h2 className="font-display text-lg font-semibold text-[var(--ink)]">Your details</h2>
            <p className="-mt-2 text-sm text-[var(--ink-soft)]">Used on the invoice and to contact you.</p>

            {errors.root?.message && (
              <Alert variant="destructive">
                <AlertDescription>{errors.root.message}</AlertDescription>
              </Alert>
            )}

            <Field label="Company name" error={errors.companyName?.message} required>
              <Input {...register("companyName")} autoComplete="organization" />
            </Field>

            <Field label="Contact person" error={errors.contactPerson?.message} required>
              <Input {...register("contactPerson")} autoComplete="name" />
            </Field>

            <FieldGroup columns={2}>
              <Field label="Email" error={errors.email?.message} required>
                <Input {...register("email")} type="email" autoComplete="email" />
              </Field>
              <Field label="Phone" error={errors.phone?.message}>
                <Input {...register("phone")} type="tel" autoComplete="tel" />
              </Field>
            </FieldGroup>

            <Field label="Billing address" error={errors.address?.message}>
              <Textarea {...register("address")} rows={2} autoComplete="street-address" />
            </Field>

            <Field label="Tax identifier" error={errors.taxIdentifier?.message} description="GSTIN, VAT number or equivalent.">
              <Input {...register("taxIdentifier")} />
            </Field>

            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setStepId("review")}>
                <ArrowLeft aria-hidden />
                Back
              </Button>
              <Button type="submit" size="lg" className="flex-1" loading={isSubmitting} disabled={expired}>
                {expired ? "Reservation expired" : `Confirm ${money(stall.basePrice, stall.currency)}`}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {stepId === "done" && confirmation && (
        <Card className="mt-6 p-6">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 size-6 shrink-0" style={{ color: "var(--status-available)" }} aria-hidden />
            <div>
              <h2 className="font-display text-lg font-semibold text-[var(--ink)]">
                Booking {confirmation.bookingNumber} submitted
              </h2>
              <p className="mt-1 text-sm text-[var(--ink-soft)]">
                Stall {stall.stallNumber} is reserved against your details.
              </p>
            </div>
          </div>

          <dl className="mt-5 space-y-3 border-t border-[var(--line)] pt-5 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--ink-soft)]">Amount due</dt>
              <dd className="font-display text-xl font-semibold text-[var(--ink)]">
                {money(confirmation.total, confirmation.currency)}
              </dd>
            </div>
            {confirmation.invoiceNumber && (
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--ink-soft)]">Invoice</dt>
                <dd className="font-mono text-[var(--ink)]">{confirmation.invoiceNumber}</dd>
              </div>
            )}
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--ink-soft)]">Status</dt>
              <dd className="text-[var(--ink)]">Awaiting payment confirmation</dd>
            </div>
          </dl>

          <Alert variant="info" className="mt-5">
            <AlertTitle>What happens next</AlertTitle>
            <AlertDescription>
              A confirmation email is on its way. The organizer marks your booking confirmed once payment is
              received — until then the stall is held for you and shown to others as pending.
            </AlertDescription>
          </Alert>

          <Button asChild variant="outline" className="mt-5 w-full">
            <Link href={`${bookingBasePath}/${slug}`}>Back to the floor plan</Link>
          </Button>
        </Card>
      )}
    </main>
  );
}
