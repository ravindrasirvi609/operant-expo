"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { credentialsSchema } from "@/lib/auth/input";
import { apiRequest } from "@/lib/http/client";
import { applyApiErrors, useZodForm } from "@/lib/ui/forms";

export default function LoginPage() {
  const router = useRouter();
  const form = useZodForm(credentialsSchema, { email: "", password: "" });
  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = form;

  const submit = handleSubmit(async (values) => {
    clearErrors("root");
    const result = await apiRequest("/api/auth/login", { method: "POST", json: values });

    if (!result.ok) {
      applyApiErrors(result, setError);
      return;
    }

    toast.success("Signed in.");
    router.push("/dashboard");
  });

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-blueprint-grid px-4 py-10">
      <Card className="corner-marks w-full max-w-md p-8">
        <div className="space-y-2">
          <p className="font-mono text-xs uppercase tracking-widest text-[var(--brand-quiet)]">Operant Expo</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-[var(--ink)]">Welcome back</h1>
          <p className="text-sm text-[var(--ink-soft)]">Sign in to manage your exhibitions.</p>
        </div>

        <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
          {errors.root?.message && (
            <Alert variant="destructive">
              <AlertDescription>{errors.root.message}</AlertDescription>
            </Alert>
          )}

          <Field label="Email" error={errors.email?.message} required>
            <Input {...register("email")} type="email" autoComplete="email" placeholder="name@company.com" />
          </Field>

          <Field label="Password" error={errors.password?.message} required>
            <Input {...register("password")} type="password" autoComplete="current-password" placeholder="••••••••" />
          </Field>

          <Button type="submit" loading={isSubmitting} className="w-full" size="lg">
            {isSubmitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <p className="mt-5 text-sm text-[var(--ink-soft)]">
          New here?{" "}
          <Link className="font-medium text-[var(--brand-quiet)] hover:underline" href="/register">
            Create an account
          </Link>
        </p>
      </Card>
    </main>
  );
}
