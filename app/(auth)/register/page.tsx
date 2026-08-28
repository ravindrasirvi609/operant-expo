"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { parseJsonResponse } from "@/lib/http/client";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const body = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await parseJsonResponse<{ error?: string }>(response);
    if (!response.ok || data.error) {
      setError(data.error ?? "Unable to create account");
      setSaving(false);
      return;
    }
    router.push("/dashboard");
  }

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-blueprint-grid px-6">
      <form onSubmit={submit} className="corner-marks w-full max-w-md space-y-4 rounded-2xl border border-[var(--line)] bg-[var(--paper-raised)] p-8 shadow-sm">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-[var(--accent-ink)] dark:text-[var(--accent)]">Operant Expo</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-[var(--ink)]">Create your workspace</h1>
          <p className="mt-2 text-sm text-[var(--ink-soft)]">One account, one organization, ready to publish exhibitions.</p>
        </div>
        {error && <p role="alert" className="rounded-md border border-[var(--booked)] bg-[color-mix(in_srgb,var(--booked)_10%,transparent)] p-3 text-sm text-[var(--booked)]">{error}</p>}
        <input name="name" required placeholder="Your name" className="w-full rounded-md border border-[var(--line-strong)] bg-transparent p-3" />
        <input name="organizationName" required placeholder="Organization name" className="w-full rounded-md border border-[var(--line-strong)] bg-transparent p-3" />
        <input name="organizationSlug" required placeholder="organization-slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" title="Lowercase letters, numbers and hyphens only" className="w-full rounded-md border border-[var(--line-strong)] bg-transparent p-3" />
        <input name="email" type="email" required placeholder="Email" className="w-full rounded-md border border-[var(--line-strong)] bg-transparent p-3" />
        <input name="password" type="password" minLength={8} required placeholder="Password (8+ characters)" className="w-full rounded-md border border-[var(--line-strong)] bg-transparent p-3" />
        <button disabled={saving} className="w-full rounded-md bg-[var(--accent)] p-3 font-medium text-[var(--accent-ink)] disabled:opacity-60">
          {saving ? "Creating workspace…" : "Create account"}
        </button>
        <p className="text-sm text-[var(--ink-soft)]">Already registered? <Link className="font-medium text-[var(--accent-ink)] dark:text-[var(--accent)]" href="/login">Sign in</Link></p>
      </form>
    </main>
  );
}
