"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { SectionEyebrow } from "@/components/ui/section-eyebrow";
import { DimensionDivider } from "@/components/ui/dimension-divider";
import { parseJsonResponse } from "@/lib/http/client";

export default function NewOrganizationPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const body = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch("/api/organizations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await parseJsonResponse<{ error?: string }>(response);
    if (!response.ok || data.error) {
      setError(data.error ?? "Unable to create organization");
      setSaving(false);
      return;
    }
    router.push("/dashboard/exhibitions");
  }

  return (
    <main className="mx-auto max-w-xl px-6 py-12">
      <SectionEyebrow>Workspace settings</SectionEyebrow>
      <h1 className="mt-2 font-display text-3xl font-semibold text-[var(--ink)]">Create an organization</h1>
      <p className="mt-3 text-[var(--ink-soft)]">Create another isolated workspace for a different business or event team.</p>
      <DimensionDivider className="mt-6" />
      {error && <p role="alert" className="mt-5 rounded-md border border-[var(--booked)] bg-[color-mix(in_srgb,var(--booked)_10%,transparent)] p-3 text-sm text-[var(--booked)]">{error}</p>}
      <form onSubmit={submit} className="corner-marks mt-8 space-y-4 rounded-2xl border border-[var(--line)] bg-[var(--paper-raised)] p-6 shadow-sm">
        <input name="name" required placeholder="Organization name" className="w-full rounded-md border border-[var(--line-strong)] bg-transparent p-3" />
        <input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" title="Lowercase letters, numbers and hyphens only" placeholder="organization-slug" className="w-full rounded-md border border-[var(--line-strong)] bg-transparent p-3" />
        <button disabled={saving} className="w-full rounded-md bg-[var(--accent)] p-3 font-medium text-[var(--accent-ink)] disabled:opacity-50">{saving ? "Creating…" : "Create organization"}</button>
      </form>
    </main>
  );
}
