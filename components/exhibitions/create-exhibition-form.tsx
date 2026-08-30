"use client";

import * as React from "react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/http/client";
import { applyApiErrors, useZodForm } from "@/lib/ui/forms";
import { detectTimezone, resolveTimezoneOptions } from "@/lib/ui/timezones";
import { exhibitionCreateSchema } from "@/lib/validation/exhibition";
import { slugify } from "@/lib/validation/primitives";
import type { Venue } from "@/components/exhibitions/create-venue-form";

export type Exhibition = {
  _id: string;
  name: string;
  slug: string;
  lifecycle: string;
  startDate: string;
  endDate: string;
  shortDescription?: string;
};

/** Today as YYYY-MM-DD in the viewer's own zone, for a sensible min on the date inputs. */
function todayIsoDate() {
  const now = new Date();
  const offsetMinutes = now.getTimezoneOffset();
  return new Date(now.getTime() - offsetMinutes * 60_000).toISOString().slice(0, 10);
}

export function CreateExhibitionForm({
  organizationId,
  venues,
  onCreated,
}: {
  organizationId: string;
  venues: Venue[];
  onCreated: (exhibition: Exhibition) => void;
}) {
  const timezones = React.useMemo(() => resolveTimezoneOptions(), []);
  const today = React.useMemo(() => todayIsoDate(), []);

  const form = useZodForm(exhibitionCreateSchema, {
    name: "",
    slug: "",
    shortDescription: "",
    timezone: detectTimezone(),
    startDate: "",
    endDate: "",
    venueId: "",
    bookingMode: "DISABLED",
  });
  const {
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    watch,
    getFieldState,
    clearErrors,
    formState: { errors, isSubmitting },
  } = form;

  const startDate = watch("startDate");
  const timezone = watch("timezone");
  const venueId = watch("venueId");

  const submit = handleSubmit(async (values) => {
    clearErrors("root");
    const result = await apiRequest<{ exhibition: Exhibition }>(
      `/api/organizations/${organizationId}/exhibitions`,
      { method: "POST", json: values },
    );

    if (!result.ok) {
      applyApiErrors(result, setError);
      return;
    }

    onCreated(result.data.exhibition);
    toast.success(`${result.data.exhibition.name} created as a draft.`, {
      description: "Add a hall and a floor plan, then publish it.",
    });
    reset({ ...form.getValues(), name: "", slug: "", shortDescription: "", startDate: "", endDate: "" });
  });

  return (
    <Card className="corner-marks">
      <CardHeader>
        <CardTitle>Create exhibition</CardTitle>
        <CardDescription>
          Starts as a draft. Nothing is visible to the public until you publish it.
        </CardDescription>
      </CardHeader>
      <form onSubmit={submit} className="space-y-4 px-6 pb-6" noValidate>
        {errors.root?.message && (
          <Alert variant="destructive">
            <AlertDescription>{errors.root.message}</AlertDescription>
          </Alert>
        )}

        <Field label="Exhibition name" error={errors.name?.message} required>
          <Input
            {...register("name", {
              onChange: (event) => {
                if (getFieldState("slug").isDirty) return;
                setValue("slug", slugify(event.target.value));
              },
            })}
            placeholder="Spring Trade Expo 2027"
          />
        </Field>

        <Field
          label="Public URL"
          error={errors.slug?.message}
          description="Visitors will book at /exhibitions/your-slug."
          required
        >
          <Input {...register("slug")} placeholder="spring-trade-expo-2027" spellCheck={false} />
        </Field>

        <Field label="Short description" error={errors.shortDescription?.message}>
          <Textarea {...register("shortDescription")} rows={2} placeholder="Two lines shown on the public page." />
        </Field>

        <FieldGroup columns={2}>
          <Field label="Starts" error={errors.startDate?.message} required>
            <Input {...register("startDate")} type="date" min={today} />
          </Field>
          <Field label="Ends" error={errors.endDate?.message} required>
            {/* Constrained to the start date so the commonest mistake is impossible to make. */}
            <Input {...register("endDate")} type="date" min={startDate || today} />
          </Field>
        </FieldGroup>

        <Field label="Timezone" error={errors.timezone?.message} htmlFor="exhibition-timezone" required>
          <Select value={timezone} onValueChange={(value) => setValue("timezone", value, { shouldDirty: true })}>
            <SelectTrigger id="exhibition-timezone">
              <SelectValue placeholder="Select a timezone" />
            </SelectTrigger>
            <SelectContent>
              {timezones.map((zone) => (
                <SelectItem key={zone} value={zone}>
                  {zone.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {venues.length > 0 && (
          <Field label="Venue" error={errors.venueId?.message} htmlFor="exhibition-venue">
            <Select
              value={venueId || "none"}
              onValueChange={(value) => setValue("venueId", value === "none" ? "" : value, { shouldDirty: true })}
            >
              <SelectTrigger id="exhibition-venue">
                <SelectValue placeholder="No venue" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No venue</SelectItem>
                {venues.map((venue) => (
                  <SelectItem key={venue._id} value={venue._id}>
                    {venue.name}
                    {venue.city ? ` · ${venue.city}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}

        <Button type="submit" loading={isSubmitting} className="w-full">
          {isSubmitting ? "Creating…" : "Create exhibition"}
        </Button>
      </form>
    </Card>
  );
}
