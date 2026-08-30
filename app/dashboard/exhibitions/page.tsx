"use client";
import { useEffect, useState } from "react";

import { SectionEyebrow } from "@/components/ui/section-eyebrow";
import { DimensionDivider } from "@/components/ui/dimension-divider";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmbedCodePanel } from "@/components/dashboard/embed-code-panel";
import { parseJsonResponse } from "@/lib/http/client";

type Org = { _id: string; name: string };
type Exhibition = { _id: string; name: string; slug: string; lifecycle: string; startDate: string; endDate: string };
type Hall = { _id: string; name: string; code: string; width: number; height: number };
type Venue = { _id: string; name: string; city?: string };

export default function Exhibitions() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgId, setOrgId] = useState("");
  const [exhibitions, setExhibitions] = useState<Exhibition[]>([]);
  const [, setVenues] = useState<Venue[]>([]);
  const [halls, setHalls] = useState<Hall[]>([]);
  const [selected, setSelected] = useState<Exhibition>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load(id: string) {
    if (!id) return;
    setLoading(true);
    try {
      const [a, b] = await Promise.all([fetch(`/api/organizations/${id}/exhibitions`), fetch(`/api/organizations/${id}/venues`)]);
      const ad = await a.json(), bd = await b.json();
      if (!a.ok || !b.ok) throw new Error(ad.error ?? bd.error);
      setExhibitions(ad.exhibitions);
      setVenues(bd.venues);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load workspace");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetch("/api/me/organizations").then((r) => r.json()).then((d) => {
      setOrgs(d.organizations ?? []);
      if (d.organizations?.[0]) { setOrgId(d.organizations[0]._id); void load(d.organizations[0]._id); }
      else setLoading(false);
    }).catch(() => setError("Unable to load organizations"));
  }, []);

  async function select(e: Exhibition) {
    setSelected(e);
    const r = await fetch(`/api/organizations/${orgId}/exhibitions/${e._id}/halls`);
    const d = await r.json();
    if (r.ok) setHalls(d.halls);
    else setError(d.error);
  }

  async function lifecycle(e: Exhibition, next: string) {
    if (!orgId) return;
    setSaving(true); setError(""); setNotice("");
    const r = await fetch(`/api/organizations/${orgId}/exhibitions/${e._id}/lifecycle`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lifecycle: next }) });
    const d = await parseJsonResponse<{ error?: string; exhibition?: Exhibition }>(r);
    const updated = d.exhibition;
    if (!r.ok || d.error || !updated) setError(d.error ?? "Unable to update status");
    else {
      setExhibitions((c) => c.map((x) => (x._id === e._id ? updated : x)));
      if (selected?._id === e._id) setSelected(updated);
      setNotice(`${e.name} is now ${next.toLowerCase().replace("_", " ")}.`);
    }
    setSaving(false);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>, path: string, done: (d: Record<string, unknown>) => void) {
    event.preventDefault();
    // Capture the form before the first await — React's SyntheticEvent's currentTarget goes
    // null once the DOM event finishes dispatching, which happens well before an async handler
    // resumes after its first await.
    const form = event.currentTarget;
    setSaving(true); setError("");
    try {
      const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(new FormData(form))) });
      const d = await parseJsonResponse(r);
      if (!r.ok || d.error) throw new Error(d.error ?? "Request failed");
      done(d);
      form.reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <div className="flex flex-col gap-5 border-b border-[var(--line)] pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <SectionEyebrow>Organizer workspace</SectionEyebrow>
          <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-[var(--ink)]">Exhibitions</h1>
          <p className="mt-3 text-[var(--ink-soft)]">Create events, publish them, and open your stall booking experience.</p>
        </div>
        <select value={orgId} onChange={(e) => { setOrgId(e.target.value); void load(e.target.value); }} className="rounded-md border border-[var(--line-strong)] bg-[var(--paper-raised)] px-4 py-3 text-sm">
          {orgs.map((o) => <option key={o._id} value={o._id}>{o.name}</option>)}
        </select>
      </div>
      {error && <p role="alert" className="mt-5 rounded-md border border-[var(--status-booked)] bg-[color-mix(in_srgb,var(--status-booked)_10%,transparent)] p-4 text-sm text-[var(--status-booked)]">{error}</p>}
      {notice && <p role="status" className="mt-5 rounded-md border border-[var(--status-available)] bg-[color-mix(in_srgb,var(--status-available)_10%,transparent)] p-4 text-sm text-[var(--status-available)]">{notice}</p>}
      {loading ? (
        <p className="mt-8 text-[var(--ink-soft)]">Loading exhibitions…</p>
      ) : (
        <div className="mt-8 grid gap-8 xl:grid-cols-[1fr_360px]">
          <section>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-display text-xl font-semibold text-[var(--ink)]">Your exhibitions</h2>
                <p className="mt-1 text-sm text-[var(--ink-soft)]">Manage publication and booking availability.</p>
              </div>
              <span className="rounded-full border border-[var(--line-strong)] px-3 py-1 font-mono text-xs text-[var(--ink-soft)]">{exhibitions.length} total</span>
            </div>
            {exhibitions.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--line-strong)] p-12 text-center text-[var(--ink-soft)]">No exhibitions yet. Create one from the panel.</div>
            ) : (
              <div className="space-y-3">
                {exhibitions.map((e) => (
                  <div key={e._id} className={`corner-marks rounded-2xl border bg-[var(--paper-raised)] p-5 shadow-sm ${selected?._id === e._id ? "border-[var(--brand)]" : "border-[var(--line)]"}`} data-active={selected?._id === e._id}>
                    <button onClick={() => void select(e)} className="w-full text-left">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="font-display text-lg font-semibold text-[var(--ink)]">{e.name}</h3>
                          <p className="mt-1 font-mono text-sm text-[var(--ink-soft)]">/{e.slug}</p>
                        </div>
                        <StatusBadge status={e.lifecycle} />
                      </div>
                      <p className="mt-4 font-mono text-sm text-[var(--ink-soft)]">{new Date(e.startDate).toLocaleDateString()} – {new Date(e.endDate).toLocaleDateString()}</p>
                    </button>
                    <div className="mt-5 flex flex-wrap gap-2 border-t border-[var(--line)] pt-4">
                      {e.lifecycle === "DRAFT" && <button disabled={saving} onClick={() => void lifecycle(e, "PUBLISHED")} className="rounded-md bg-[var(--brand)] px-3 py-2 text-xs font-semibold text-[var(--brand-ink)] disabled:opacity-50">Publish exhibition</button>}
                      {e.lifecycle === "PUBLISHED" && <button disabled={saving} onClick={() => void lifecycle(e, "BOOKING_OPEN")} className="rounded-md bg-[var(--status-available)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Open booking</button>}
                      {e.lifecycle === "BOOKING_OPEN" && <button disabled={saving} onClick={() => void lifecycle(e, "BOOKING_CLOSED")} className="rounded-md bg-[var(--status-held)] px-3 py-2 text-xs font-semibold text-[var(--brand-ink)] disabled:opacity-50">Close booking</button>}
                      {["PUBLISHED", "BOOKING_OPEN", "BOOKING_CLOSED"].includes(e.lifecycle) && <a href={`/exhibitions/${e.slug}`} target="_blank" className="rounded-md border border-[var(--line-strong)] px-3 py-2 text-xs font-semibold text-[var(--ink)]">View public page ↗</a>}
                    </div>
                    {["PUBLISHED", "BOOKING_OPEN", "BOOKING_CLOSED"].includes(e.lifecycle) && (
                      <div className="mt-3 border-t border-[var(--line)] pt-3">
                        <EmbedCodePanel slug={e.slug} name={e.name} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {selected && (
              <div className="corner-marks mt-8 rounded-2xl border border-[var(--line)] bg-[var(--paper-raised)] p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-mono text-xs uppercase tracking-widest text-[var(--brand-quiet)]">Hall setup</p>
                    <h2 className="mt-1 font-display text-xl font-semibold text-[var(--ink)]">{selected.name}</h2>
                  </div>
                  <span className="text-sm text-[var(--ink-soft)]">{halls.length} halls</span>
                </div>
                {halls.map((h) => (
                  <div key={h._id} className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] p-4">
                    <span className="text-sm font-medium text-[var(--ink)]">{h.name} <span className="font-mono text-[var(--ink-faint)]">· {h.code}</span></span>
                    <div className="flex gap-2">
                      <a className="rounded-md bg-[var(--brand)] px-3 py-2 text-xs font-semibold text-[var(--brand-ink)]" href={`/dashboard/exhibitions/${selected._id}/halls/${h._id}/map/setup?organizationId=${orgId}`}>Upload map</a>
                      <a className="rounded-md border border-[var(--line-strong)] px-3 py-2 text-xs font-semibold text-[var(--ink)]" href={`/dashboard/exhibitions/${selected._id}/halls/${h._id}/map?organizationId=${orgId}`}>View map</a>
                    </div>
                  </div>
                ))}
                <DimensionDivider className="mt-6" />
                <form className="mt-6 grid gap-3 sm:grid-cols-2" onSubmit={(e) => void submit(e, `/api/organizations/${orgId}/exhibitions/${selected._id}/halls`, (d) => setHalls((c) => [...c, d.hall as Hall]))}>
                  <input name="name" required placeholder="Hall name" className="rounded-md border border-[var(--line-strong)] bg-transparent p-3" />
                  <input name="code" required placeholder="Hall code" className="rounded-md border border-[var(--line-strong)] bg-transparent p-3" />
                  <input name="width" required type="number" min="1" placeholder="Width" className="rounded-md border border-[var(--line-strong)] bg-transparent p-3" />
                  <input name="height" required type="number" min="1" placeholder="Height" className="rounded-md border border-[var(--line-strong)] bg-transparent p-3" />
                  <button className="rounded-md bg-[var(--ink)] p-3 text-sm font-semibold text-[var(--paper)] sm:col-span-2">Add hall</button>
                </form>
              </div>
            )}
          </section>
          <aside className="space-y-5">
            <Form title="Add venue" subtitle="Add the location for your event." onSubmit={(e) => void submit(e, `/api/organizations/${orgId}/venues`, (d) => setVenues((c) => [...c, d.venue as Venue]))} fields={["name", "city", "country"]} button="Create venue" />
            <Form title="Create exhibition" subtitle="Start with the essentials; refine it later." onSubmit={(e) => void submit(e, `/api/organizations/${orgId}/exhibitions`, (d) => setExhibitions((c) => [d.exhibition as Exhibition, ...c]))} fields={["name", "slug", "shortDescription", "startDate", "endDate", "timezone"]} button="Create exhibition" />
          </aside>
        </div>
      )}
    </main>
  );
}

function Form({ title, subtitle, fields, onSubmit, button }: { title: string; subtitle: string; fields: string[]; onSubmit: (e: React.FormEvent<HTMLFormElement>) => void; button: string }) {
  return (
    <form onSubmit={onSubmit} className="corner-marks space-y-3 rounded-2xl border border-[var(--line)] bg-[var(--paper-raised)] p-6 shadow-sm">
      <h2 className="font-display font-semibold text-[var(--ink)]">{title}</h2>
      <p className="text-sm text-[var(--ink-soft)]">{subtitle}</p>
      {fields.map((f) =>
        f === "shortDescription" ? (
          <textarea key={f} name={f} placeholder="Short description" className="w-full rounded-md border border-[var(--line-strong)] bg-transparent p-3" />
        ) : (
          <input key={f} name={f} required={!["city", "country", "shortDescription"].includes(f)} type={f.includes("Date") ? "date" : "text"} defaultValue={f === "timezone" ? "Asia/Kolkata" : undefined} placeholder={f.replace(/([A-Z])/g, " $1")} className="w-full rounded-md border border-[var(--line-strong)] bg-transparent p-3" />
        ),
      )}
      <button className="w-full rounded-md bg-[var(--brand)] p-3 text-sm font-semibold text-[var(--brand-ink)]">{button}</button>
    </form>
  );
}
