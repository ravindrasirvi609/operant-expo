"use client";

import { useEffect, useMemo, useState } from "react";

type Organization = { _id: string; name: string; slug: string };
type Exhibition = { _id: string; name: string; slug: string; lifecycle: string; startDate: string; endDate: string; bookingMode: string };
type Venue = { _id: string; name: string; city?: string };
type Hall = { _id: string; name: string; code: string; width: number; height: number; status: string };

function ErrorMessage({ message }: { message: string | null }) {
  return message ? <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{message}</div> : null;
}

export default function ExhibitionsPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [exhibitions, setExhibitions] = useState<Exhibition[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedExhibition, setSelectedExhibition] = useState<Exhibition | null>(null);
  const [halls, setHalls] = useState<Hall[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const selectedOrganization = useMemo(() => organizations.find((item) => item._id === organizationId), [organizations, organizationId]);

  async function loadOrganization(id: string) {
    if (!id) return;
    setLoading(true); setError(null);
    try {
      const [exhibitionsResponse, venuesResponse] = await Promise.all([
        fetch(`/api/organizations/${id}/exhibitions`),
        fetch(`/api/organizations/${id}/venues`),
      ]);
      if (!exhibitionsResponse.ok || !venuesResponse.ok) throw new Error("Unable to load organization data");
      const exhibitionsData = await exhibitionsResponse.json();
      const venuesData = await venuesResponse.json();
      setExhibitions(exhibitionsData.exhibitions); setVenues(venuesData.venues);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load data"); }
    finally { setLoading(false); }
  }

  useEffect(() => { fetch("/api/me/organizations").then(async (response) => { if (!response.ok) throw new Error("Unable to load organizations"); return response.json(); }).then((data) => { setOrganizations(data.organizations); if (data.organizations[0]) { setOrganizationId(data.organizations[0]._id); void loadOrganization(data.organizations[0]._id); } }).catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to load organizations")); }, []);

  async function submitForm(event: React.FormEvent<HTMLFormElement>, path: string, success: (data: Record<string, unknown>) => void) {
    event.preventDefault(); setSaving(true); setError(null);
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
    try { const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Request failed"); success(data); event.currentTarget.reset(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Request failed"); } finally { setSaving(false); }
  }

  async function selectExhibition(exhibition: Exhibition) { setSelectedExhibition(exhibition); const response = await fetch(`/api/organizations/${organizationId}/exhibitions/${exhibition._id}/halls`); const data = await response.json(); if (response.ok) setHalls(data.halls); else setError(data.error ?? "Unable to load halls"); }

  return <main className="mx-auto max-w-7xl px-6 py-10"><div className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-medium text-indigo-600">Organizer workspace</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Exhibitions</h1><p className="mt-2 text-zinc-500">Create events, venues and halls for your organization.</p></div><select aria-label="Organization" value={organizationId} onChange={(event) => { setOrganizationId(event.target.value); void loadOrganization(event.target.value); }} className="rounded-lg border bg-white px-3 py-2"><option value="">Select organization</option>{organizations.map((organization) => <option key={organization._id} value={organization._id}>{organization.name}</option>)}</select></div><div className="mt-6"><ErrorMessage message={error} /></div>{loading ? <div className="mt-8 animate-pulse rounded-xl bg-zinc-100 p-8 text-zinc-500">Loading workspace…</div> : !selectedOrganization ? <div className="mt-8 rounded-xl border border-dashed p-10 text-center text-zinc-500">No organization found.</div> : <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]"><section className="space-y-4"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Your exhibitions</h2><span className="text-sm text-zinc-500">{exhibitions.length} total</span></div>{exhibitions.length === 0 ? <div className="rounded-xl border border-dashed p-8 text-sm text-zinc-500">No exhibitions yet. Create the first one using the form.</div> : exhibitions.map((exhibition) => <button key={exhibition._id} onClick={() => void selectExhibition(exhibition)} className={`block w-full rounded-xl border bg-white p-5 text-left shadow-sm transition hover:border-indigo-300 ${selectedExhibition?._id === exhibition._id ? "border-indigo-500 ring-2 ring-indigo-100" : "border-zinc-200"}`}><div className="flex items-start justify-between gap-4"><div><h3 className="font-semibold">{exhibition.name}</h3><p className="mt-1 text-sm text-zinc-500">/{exhibition.slug}</p></div><span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium">{exhibition.lifecycle}</span></div><p className="mt-4 text-sm text-zinc-500">{new Date(exhibition.startDate).toLocaleDateString()} – {new Date(exhibition.endDate).toLocaleDateString()}</p></button>)}{selectedExhibition && <div className="rounded-xl border bg-white p-5"><h2 className="font-semibold">Halls in {selectedExhibition.name}</h2>{halls.length === 0 ? <p className="mt-3 text-sm text-zinc-500">No halls yet.</p> : <ul className="mt-3 space-y-2">{halls.map((hall) => <li key={hall._id} className="flex justify-between rounded-lg bg-zinc-50 px-3 py-2 text-sm"><span>{hall.name} <span className="text-zinc-500">({hall.code})</span></span><span className="text-zinc-500">{hall.width} × {hall.height}</span></li>)}</ul>}<form className="mt-5 grid gap-3 sm:grid-cols-2" onSubmit={(event) => void submitForm(event, `/api/organizations/${organizationId}/exhibitions/${selectedExhibition._id}/halls`, (data) => setHalls((current) => [...current, data.hall as Hall]))}><input name="name" required placeholder="Hall name" className="rounded-lg border p-2.5" /><input name="code" required placeholder="Hall code" className="rounded-lg border p-2.5" /><input name="width" required type="number" min="1" placeholder="Width" className="rounded-lg border p-2.5" /><input name="height" required type="number" min="1" placeholder="Height" className="rounded-lg border p-2.5" /><button disabled={saving} className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50 sm:col-span-2">{saving ? "Saving…" : "Add hall"}</button></form></div>}</section><aside className="space-y-6"><form className="space-y-3 rounded-xl border bg-white p-5 shadow-sm" onSubmit={(event) => void submitForm(event, `/api/organizations/${organizationId}/venues`, (data) => setVenues((current) => [...current, data.venue as Venue]))}><h2 className="font-semibold">Add venue</h2><input name="name" required placeholder="Venue name" className="w-full rounded-lg border p-2.5" /><input name="city" placeholder="City" className="w-full rounded-lg border p-2.5" /><input name="country" placeholder="Country" className="w-full rounded-lg border p-2.5" /><button disabled={saving} className="w-full rounded-lg border px-4 py-2.5 text-sm font-medium disabled:opacity-50">{saving ? "Saving…" : "Create venue"}</button>{venues.length > 0 && <p className="text-xs text-zinc-500">{venues.length} venue{venues.length === 1 ? "" : "s"} available</p>}</form><form className="space-y-3 rounded-xl border bg-white p-5 shadow-sm" onSubmit={(event) => void submitForm(event, `/api/organizations/${organizationId}/exhibitions`, (data) => setExhibitions((current) => [data.exhibition as Exhibition, ...current]))}><h2 className="font-semibold">Create exhibition</h2><input name="name" required placeholder="Exhibition name" className="w-full rounded-lg border p-2.5" /><input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="public-slug" className="w-full rounded-lg border p-2.5" /><textarea name="shortDescription" placeholder="Short description" className="w-full rounded-lg border p-2.5" /><select name="venueId" className="w-full rounded-lg border bg-white p-2.5"><option value="">No venue selected</option>{venues.map((venue) => <option key={venue._id} value={venue._id}>{venue.name}{venue.city ? ` – ${venue.city}` : ""}</option>)}</select><div className="grid grid-cols-2 gap-3"><input name="startDate" required type="date" className="rounded-lg border p-2.5" /><input name="endDate" required type="date" className="rounded-lg border p-2.5" /></div><input name="timezone" required defaultValue="Asia/Kolkata" placeholder="Timezone" className="w-full rounded-lg border p-2.5" /><button disabled={saving} className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">{saving ? "Creating…" : "Create exhibition"}</button></form></aside></div>}</main>;
}

