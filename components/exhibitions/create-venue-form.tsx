"use client";

import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/http/client";
import { applyApiErrors, useZodForm } from "@/lib/ui/forms";
import { venueSchema } from "@/lib/validation/exhibition";

export type Venue = { _id: string; name: string; city?: string };

export function CreateVenueForm({
  organizationId,
  onCreated,
}: {
  organizationId: string;
  onCreated: (venue: Venue) => void;
}) {
  const form = useZodForm(venueSchema, { name: "", address: "", city: "", country: "" });
  const {
    register,
    handleSubmit,
    reset,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = form;

  const submit = handleSubmit(async (values) => {
    clearErrors("root");
    const result = await apiRequest<{ venue: Venue }>(`/api/organizations/${organizationId}/venues`, {
      method: "POST",
      json: values,
    });

    if (!result.ok) {
      applyApiErrors(result, setError);
      return;
    }

    onCreated(result.data.venue);
    toast.success(`${result.data.venue.name} added.`);
    reset();
  });

  return (
    <Card className="corner-marks">
      <CardHeader>
        <CardTitle>Add venue</CardTitle>
        <CardDescription>Where the event physically takes place. Optional, but useful on public pages.</CardDescription>
      </CardHeader>
      <form onSubmit={submit} className="space-y-4 px-6 pb-6" noValidate>
        {errors.root?.message && (
          <Alert variant="destructive">
            <AlertDescription>{errors.root.message}</AlertDescription>
          </Alert>
        )}

        <Field label="Venue name" error={errors.name?.message} required>
          <Input {...register("name")} placeholder="Bombay Exhibition Centre" />
        </Field>

        <Field label="Address" error={errors.address?.message}>
          <Input {...register("address")} placeholder="Western Express Highway, Goregaon East" />
        </Field>

        <FieldGroup columns={2}>
          <Field label="City" error={errors.city?.message}>
            <Input {...register("city")} placeholder="Mumbai" />
          </Field>
          <Field label="Country" error={errors.country?.message}>
            <Input {...register("country")} placeholder="India" />
          </Field>
        </FieldGroup>

        <Button type="submit" loading={isSubmitting} className="w-full">
          {isSubmitting ? "Adding…" : "Add venue"}
        </Button>
      </form>
    </Card>
  );
}
