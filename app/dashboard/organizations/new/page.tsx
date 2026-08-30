"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { useOrganization } from "@/components/providers/organization-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DimensionDivider } from "@/components/ui/dimension-divider";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SectionEyebrow } from "@/components/ui/section-eyebrow";
import { apiRequest } from "@/lib/http/client";
import { applyApiErrors, useZodForm } from "@/lib/ui/forms";
import { organizationSchema } from "@/lib/validation/organization";
import { slugify } from "@/lib/validation/primitives";

export default function NewOrganizationPage() {
  const router = useRouter();
  const { refresh, selectOrganization } = useOrganization();
  const form = useZodForm(organizationSchema, { name: "", slug: "" });
  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    setValue,
    getFieldState,
    formState: { errors, isSubmitting },
  } = form;

  const submit = handleSubmit(async (values) => {
    clearErrors("root");
    const result = await apiRequest<{ organization: { _id: string; name: string } }>("/api/organizations", {
      method: "POST",
      json: values,
    });

    if (!result.ok) {
      applyApiErrors(result, setError);
      return;
    }

    // Pull the new membership into the provider and switch to it, so the user lands on a
    // dashboard already scoped to the workspace they just made.
    await refresh();
    selectOrganization(result.data.organization._id);
    toast.success(`${result.data.organization.name} is ready.`);
    router.push("/dashboard/exhibitions");
  });

  return (
    <main className="mx-auto max-w-xl px-4 py-10 sm:px-6">
      <SectionEyebrow>Workspace settings</SectionEyebrow>
      <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-[var(--ink)]">
        Create an organization
      </h1>
      <p className="mt-3 text-[var(--ink-soft)]">
        A separate workspace for a different business or event team. Exhibitions, stalls and bookings never cross
        between organizations.
      </p>
      <DimensionDivider className="mt-6" />

      <Card className="corner-marks mt-8 p-6">
        <form onSubmit={submit} className="space-y-4" noValidate>
          {errors.root?.message && (
            <Alert variant="destructive">
              <AlertDescription>{errors.root.message}</AlertDescription>
            </Alert>
          )}

          <Field label="Organization name" error={errors.name?.message} required>
            <Input
              {...register("name", {
                onChange: (event) => {
                  if (getFieldState("slug").isDirty) return;
                  setValue("slug", slugify(event.target.value));
                },
              })}
              placeholder="Acme Expo Group"
              autoComplete="organization"
            />
          </Field>

          <Field
            label="Workspace URL"
            error={errors.slug?.message}
            description="Lowercase letters, numbers and hyphens only."
            required
          >
            <Input {...register("slug")} placeholder="acme-expo-group" spellCheck={false} />
          </Field>

          <div className="flex gap-2">
            <Button type="submit" loading={isSubmitting} className="flex-1">
              {isSubmitting ? "Creating…" : "Create organization"}
            </Button>
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    </main>
  );
}
