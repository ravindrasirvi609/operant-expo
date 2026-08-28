"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { parseJsonResponse } from "@/lib/http/client";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const body = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await parseJsonResponse<{ error?: string }>(response);
    if (!response.ok || data.error) {
      setError(data.error ?? "Unable to sign in");
      setSaving(false);
      return;
    }
    router.push("/dashboard");
  }

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-blueprint-grid px-6">
      <form onSubmit={submit} className="corner-marks w-full max-w-md space-y-5 rounded-2xl border border-[var(--line)] bg-[var(--paper-raised)] p-8 shadow-sm">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-[var(--accent-ink)] dark:text-[var(--accent)]">Operant Expo</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-[var(--ink)]">Welcome back</h1>
          <p className="mt-2 text-sm text-[var(--ink-soft)]">Sign in to manage your exhibitions.</p>
        </div>
        {error && <p role="alert" className="rounded-md border border-[var(--booked)] bg-[color-mix(in_srgb,var(--booked)_10%,transparent)] p-3 text-sm text-[var(--booked)]">{error}</p>}
        <label className="block text-sm font-medium text-[var(--ink)]">
          Email
          <input name="email" type="email" required className="mt-2 w-full rounded-md border border-[var(--line-strong)] bg-transparent p-3" />
        </label>
        <label className="block text-sm font-medium text-[var(--ink)]">
          Password
          <input name="password" type="password" required minLength={8} className="mt-2 w-full rounded-md border border-[var(--line-strong)] bg-transparent p-3" />
        </label>
        <button disabled={saving} className="w-full rounded-md bg-[var(--accent)] p-3 font-medium text-[var(--accent-ink)] disabled:opacity-60">
          {saving ? "Signing in…" : "Sign in"}
        </button>
        <p className="text-sm text-[var(--ink-soft)]">New here? <Link className="font-medium text-[var(--accent-ink)] dark:text-[var(--accent)]" href="/register">Create an account</Link></p>
      </form>
    </main>
  );
}
