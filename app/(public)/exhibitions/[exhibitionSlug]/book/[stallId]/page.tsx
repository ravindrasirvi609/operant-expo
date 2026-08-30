"use client";

import * as React from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SectionEyebrow } from "@/components/ui/section-eyebrow";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/http/client";
import { applyApiErrors, useZodForm } from "@/lib/ui/forms";
import { exhibitorSchema } from "@/lib/validation/booking";

type Ids = { exhibitionSlug: string; stallId: string };

function remainingSeconds(expiresAt: number) {
  return Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
}

export default function BookingPage({ params }: { params: Promise<Ids> }) {
  const [ids, setIds] = React.useState<Ids | null>(null);
  const [expiresAt, setExpiresAt] = React.useState<number | null>(null);
  const [seconds, setSeconds] = React.useState(0);
  const [holdError, setHoldError] = React.useState("");
  const [holding, setHolding] = React.useState(true);
  const [confirmation, setConfirmation] = React.useState<{ bookingNumber: string; total: number; currency: string } | null>(
    null,
  );

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

  React.useEffect(() => {
    void params.then(setIds);
  }, [params]);

  React.useEffect(() => {
    if (!ids) return;
    let cancelled = false;

    void apiRequest<{ hold: { expiresAt: string } }>(
      `/api/public/exhibitions/${ids.exhibitionSlug}/stalls/${ids.stallId}/hold`,
      { method: "POST" },
    ).then((result) => {
      if (cancelled) return;
      setHolding(false);
      if (!result.ok) {
        setHoldError(result.error);
        return;
      }
      // Seed the countdown from the timestamp immediately. Starting at 0 and waiting for the
      // first interval tick left the submit button disabled for a second, and an early submit
      // reported "reservation expired" on a hold that had just been created.
      const expiry = new Date(result.data.hold.expiresAt).getTime();
      setExpiresAt(expiry);
      setSeconds(remainingSeconds(expiry));
    });

    return () => {
      cancelled = true;
    };
  }, [ids]);

  React.useEffect(() => {
    if (!expiresAt) return;
    const timer = setInterval(() => setSeconds(remainingSeconds(expiresAt)), 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  const expired = Boolean(expiresAt) && seconds === 0;

  const submit = handleSubmit(async (values) => {
    if (!ids) return;
    clearErrors("root");

    if (expired) {
      setError("root", { type: "server", message: "Your reservation expired. Go back and select the stall again." });
      return;
    }

    const result = await apiRequest<{
      booking: { bookingNumber: string; total: number; currency: string };
    }>(`/api/public/exhibitions/${ids.exhibitionSlug}/bookings`, {
      method: "POST",
      json: { ...values, stallId: ids.stallId },
      // A fresh key per attempt: a retry after a failure is a new booking attempt, while a
      // double-click within one attempt reuses this key and cannot create two bookings.
      idempotencyKey: crypto.randomUUID(),
    });

    if (!result.ok) {
      applyApiErrors(result, setError);
      return;
    }

    setConfirmation(result.data.booking);
    toast.success(`Booking ${result.data.booking.bookingNumber} submitted.`);
  });

  return (
    <main className="mx-auto max-w-lg px-4 py-12 sm:px-6">
      <SectionEyebrow>Reserve your space</SectionEyebrow>
      <h1 className="mt-2 font-display text-3xl font-semibold text-[var(--ink)]">Exhibitor booking</h1>

      {holding && <Skeleton className="mt-6 h-16" />}

      {holdError && (
        <Alert variant="destructive" className="mt-6">
          <AlertTitle>This stall could not be reserved</AlertTitle>
          <AlertDescription>{holdError}</AlertDescription>
        </Alert>
      )}

      {expiresAt && !confirmation && (
        <Alert variant={expired ? "destructive" : "warning"} className="mt-6" icon={false}>
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm">{expired ? "Your reservation has expired" : "Stall held for"}</span>
            <span className="font-mono text-lg font-semibold tabular">
              {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
            </span>
          </div>
        </Alert>
      )}

      {confirmation ? (
        <Alert variant="success" className="mt-6">
          <AlertTitle>Booking {confirmation.bookingNumber} submitted</AlertTitle>
          <AlertDescription>
            We have reserved the stall against your details. The organizer confirms it once payment of{" "}
            <strong>
              {confirmation.total.toLocaleString()} {confirmation.currency}
            </strong>{" "}
            is received. A confirmation email is on its way.
          </AlertDescription>
        </Alert>
      ) : (
        <Card className="mt-6 p-6">
          <form onSubmit={submit} className="space-y-4" noValidate>
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

            <Field label="Address" error={errors.address?.message}>
              <Textarea {...register("address")} rows={2} autoComplete="street-address" />
            </Field>

            <Button type="submit" size="lg" className="w-full" loading={isSubmitting} disabled={!expiresAt || expired}>
              {isSubmitting ? "Submitting…" : "Submit booking"}
            </Button>
          </form>
        </Card>
      )}
    </main>
  );
}
