"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { registrationSchema } from "@/lib/auth/input";
import { apiRequest } from "@/lib/http/client";
import { slugify } from "@/lib/validation/primitives";
import { applyApiErrors, useZodForm } from "@/lib/ui/forms";

export default function RegisterPage() {
  const router = useRouter();
  const form = useZodForm(registrationSchema, {
    name: "",
    organizationName: "",
    organizationSlug: "",
    email: "",
    password: "",
  });
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
    const result = await apiRequest("/api/auth/register", { method: "POST", json: values });

    if (!result.ok) {
      applyApiErrors(result, setError);
      return;
    }

    toast.success("Workspace created. Welcome aboard.");
    router.push("/dashboard");
  });

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-blueprint-grid px-4 py-10">
      <Card className="corner-marks w-full max-w-md p-8">
        <div className="space-y-2">
          <p className="font-mono text-xs uppercase tracking-widest text-[var(--brand-quiet)]">Operant Expo</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-[var(--ink)]">
            Create your workspace
          </h1>
          <p className="text-sm text-[var(--ink-soft)]">
            One account, one organization, ready to publish exhibitions.
          </p>
        </div>

        <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
          {errors.root?.message && (
            <Alert variant="destructive">
              <AlertDescription>{errors.root.message}</AlertDescription>
            </Alert>
          )}

          <Field label="Your name" error={errors.name?.message} required>
            <Input {...register("name")} autoComplete="name" placeholder="Ravindra Sharma" />
          </Field>

          <Field label="Organization name" error={errors.organizationName?.message} required>
            <Input
              {...register("organizationName", {
                // Suggest a slug as the name is typed, but stop the moment the user edits the
                // slug themselves — overwriting their choice mid-typing is worse than no help.
                onChange: (event) => {
                  if (getFieldState("organizationSlug").isDirty) return;
                  setValue("organizationSlug", slugify(event.target.value));
                },
              })}
              autoComplete="organization"
              placeholder="Acme Expo Group"
            />
          </Field>

          <Field
            label="Workspace URL"
            error={errors.organizationSlug?.message}
            description="Lowercase letters, numbers and hyphens. Used in your public exhibition links."
            required
          >
            <Input {...register("organizationSlug")} placeholder="acme-expo-group" spellCheck={false} />
          </Field>

          <FieldGroup columns={1}>
            <Field label="Email" error={errors.email?.message} required>
              <Input {...register("email")} type="email" autoComplete="email" placeholder="name@company.com" />
            </Field>

            <Field label="Password" error={errors.password?.message} description="At least 8 characters." required>
              <Input {...register("password")} type="password" autoComplete="new-password" placeholder="••••••••" />
            </Field>
          </FieldGroup>

          <Button type="submit" loading={isSubmitting} className="w-full" size="lg">
            {isSubmitting ? "Creating workspace…" : "Create account"}
          </Button>
        </form>

        <p className="mt-5 text-sm text-[var(--ink-soft)]">
          Already registered?{" "}
          <Link className="font-medium text-[var(--brand-quiet)] hover:underline" href="/login">
            Sign in
          </Link>
        </p>
      </Card>
    </main>
  );
}
