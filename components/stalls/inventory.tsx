"use client";

import { useEffect, useState } from "react";

import { SectionEyebrow } from "@/components/ui/section-eyebrow";
import { StatusBadge } from "@/components/ui/status-badge";
import { parseJsonResponse } from "@/lib/http/client";

type Org = { _id: string; name: string }; type Exhibition = { _id: string; name: string }; type Hall = { _id: string; name: string }; type Element = { _id: string; label?: string };
type Stall = { _id: string; floorPlanElementId: string; stallNumber: string; section?: string; stallType: string; width: number; height: number; basePrice: number; currency: string; status: string; visibility: string; amenities: string[]; area: number };
const statuses = ["AVAILABLE", "PENDING", "BLOCKED", "HELD", "BOOKED"];
const types = ["STANDARD", "PREMIUM", "CORNER", "ISLAND", "RAW_SPACE", "SHELL_SCHEME"];

export default function StallsInventory() {
  const [orgs, setOrgs] = useState<Org[]>([]), [orgId, setOrgId] = useState(""), [exhibitions, setExhibitions] = useState<Exhibition[]>([]), [exId, setExId] = useState(""), [halls, setHalls] = useState<Hall[]>([]), [hallId, setHallId] = useState(""), [elements, setElements] = useState<Element[]>([]), [stalls, setStalls] = useState<Stall[]>([]), [editing, setEditing] = useState<Stall>(), [loading, setLoading] = useState(true), [error, setError] = useState(""), [message, setMessage] = useState("");
  useEffect(() => { fetch("/api/me/organizations").then((r) => r.json()).then((d) => { setOrgs(d.organizations ?? []); setOrgId(d.organizations?.[0]?._id ?? ""); }).catch(() => setError("Unable to load organizations")); }, []);
  useEffect(() => { if (!orgId) return; fetch(`/api/organizations/${orgId}/exhibitions`).then((r) => r.json()).then((d) => { setExhibitions(d.exhibitions ?? []); setExId(d.exhibitions?.[0]?._id ?? ""); }).catch(() => setError("Unable to load exhibitions")); }, [orgId]);
  useEffect(() => { if (!orgId || !exId) return; fetch(`/api/organizations/${orgId}/exhibitions/${exId}/halls`).then((r) => r.json()).then((d) => { setHalls(d.halls ?? []); setHallId(d.halls?.[0]?._id ?? ""); }).catch(() => setError("Unable to load halls")); }, [orgId, exId]);
  async function loadHall(id: string) { setHallId(id); if (!orgId || !exId || !id) return; setLoading(true); setError(""); try { const [a, b] = await Promise.all([fetch(`/api/organizations/${orgId}/exhibitions/${exId}/halls/${id}/stalls`), fetch(`/api/organizations/${orgId}/exhibitions/${exId}/halls/${id}/map-elements`)]); const ad = await a.json(), bd = await b.json(); if (!a.ok || !b.ok) throw Error(ad.error ?? bd.error); setStalls(ad.stalls ?? []); setElements(bd.elements ?? []); } catch (e) { setError(e instanceof Error ? e.message : "Unable to load hall"); } finally { setLoading(false); } }
  // The loader intentionally follows the selected hall; organization and exhibition are
  // already reflected in the selected hall list before this effect runs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (hallId) void loadHall(hallId); }, [hallId]);
  async function submit(event: React.FormEvent<HTMLFormElement>, stall?: Stall) { event.preventDefault(); const form = event.currentTarget; setError(""); setMessage(""); const raw = Object.fromEntries(new FormData(form)); const body = { ...raw, width: Number(raw.width), height: Number(raw.height), basePrice: Number(raw.basePrice), amenities: typeof raw.amenities === "string" && raw.amenities ? raw.amenities.split(",").map((v) => v.trim()).filter(Boolean) : [] }; const url = stall ? `/api/organizations/${orgId}/exhibitions/${exId}/halls/${hallId}/stalls/${stall._id}` : `/api/organizations/${orgId}/exhibitions/${exId}/halls/${hallId}/stalls`; const r = await fetch(url, { method: stall ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const d = await parseJsonResponse<{ error?: string; stall?: Stall }>(r); const savedStall = d.stall; if (!r.ok || d.error || !savedStall) setError(d.error ?? "Unable to save stall"); else { setStalls((all) => stall ? all.map((s) => s._id === stall._id ? savedStall : s) : [...all, savedStall]); setEditing(undefined); setMessage(stall ? `Stall ${savedStall.stallNumber} updated.` : `Stall ${savedStall.stallNumber} added to inventory.`); if (!stall) form.reset(); } }
  const form = (stall?: Stall) => (
    <form onSubmit={(e) => void submit(e, stall)} className="space-y-3">
      {!stall && <select name="floorPlanElementId" required className="w-full rounded-md border border-[var(--line-strong)] bg-[var(--paper-raised)] p-3"><option value="">Select map stall element</option>{elements.map((e) => <option key={e._id} value={e._id}>{e.label ?? "Unnamed stall"}</option>)}</select>}
      <input name="stallNumber" required defaultValue={stall?.stallNumber} placeholder="Stall number e.g. A-12" className="w-full rounded-md border border-[var(--line-strong)] bg-transparent p-3" />
      <input name="section" defaultValue={stall?.section} placeholder="Section e.g. A" className="w-full rounded-md border border-[var(--line-strong)] bg-transparent p-3" />
      <select name="stallType" defaultValue={stall?.stallType ?? "STANDARD"} className="w-full rounded-md border border-[var(--line-strong)] bg-[var(--paper-raised)] p-3">{types.map((v) => <option key={v} value={v}>{v.replace("_", " ")}</option>)}</select>
      <div className="grid grid-cols-2 gap-3">
        <input name="width" required type="number" min="1" defaultValue={stall?.width} placeholder="Width" className="rounded-md border border-[var(--line-strong)] bg-transparent p-3" />
        <input name="height" required type="number" min="1" defaultValue={stall?.height} placeholder="Height" className="rounded-md border border-[var(--line-strong)] bg-transparent p-3" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <input name="basePrice" required type="number" min="0" defaultValue={stall?.basePrice} placeholder="Base price" className="rounded-md border border-[var(--line-strong)] bg-transparent p-3" />
        <input name="currency" required defaultValue={stall?.currency ?? "INR"} maxLength={3} placeholder="Currency" className="rounded-md border border-[var(--line-strong)] bg-transparent p-3" />
      </div>
      <input name="amenities" defaultValue={stall?.amenities?.join(", ")} placeholder="Amenities, comma separated" className="w-full rounded-md border border-[var(--line-strong)] bg-transparent p-3" />
      <div className="grid grid-cols-2 gap-3">
        <select name="status" defaultValue={stall?.status ?? "AVAILABLE"} className="rounded-md border border-[var(--line-strong)] bg-[var(--paper-raised)] p-3">{statuses.map((v) => <option key={v} value={v}>{v}</option>)}</select>
        <select name="visibility" defaultValue={stall?.visibility ?? "PUBLIC"} className="rounded-md border border-[var(--line-strong)] bg-[var(--paper-raised)] p-3"><option value="PUBLIC">PUBLIC</option><option value="PRIVATE">PRIVATE</option></select>
      </div>
      <div className="flex gap-2">
        <button className="flex-1 rounded-md bg-[var(--accent)] p-3 font-semibold text-[var(--accent-ink)]">{stall ? "Save changes" : "Create stall"}</button>
        {stall && <button type="button" onClick={() => setEditing(undefined)} className="rounded-md border border-[var(--line-strong)] px-4 text-[var(--ink)]">Cancel</button>}
      </div>
    </form>
  );
  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <div className="flex flex-col gap-5 border-b border-[var(--line)] pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <SectionEyebrow>Inventory</SectionEyebrow>
          <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-[var(--ink)]">Stalls</h1>
          <p className="mt-3 text-[var(--ink-soft)]">Manage pricing, visibility and live availability for every bookable stall.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={orgId} onChange={(e) => setOrgId(e.target.value)} className="rounded-md border border-[var(--line-strong)] bg-[var(--paper-raised)] px-3 py-2 text-sm">{orgs.map((o) => <option key={o._id} value={o._id}>{o.name}</option>)}</select>
          <select value={exId} onChange={(e) => setExId(e.target.value)} className="rounded-md border border-[var(--line-strong)] bg-[var(--paper-raised)] px-3 py-2 text-sm">{exhibitions.map((e) => <option key={e._id} value={e._id}>{e.name}</option>)}</select>
          <select value={hallId} onChange={(e) => void loadHall(e.target.value)} className="rounded-md border border-[var(--line-strong)] bg-[var(--paper-raised)] px-3 py-2 text-sm">{halls.map((h) => <option key={h._id} value={h._id}>{h.name}</option>)}</select>
        </div>
      </div>
      {error && <p role="alert" className="mt-5 rounded-md border border-[var(--booked)] bg-[color-mix(in_srgb,var(--booked)_10%,transparent)] p-4 text-sm text-[var(--booked)]">{error}</p>}
      {message && <p role="status" className="mt-5 rounded-md border border-[var(--available)] bg-[color-mix(in_srgb,var(--available)_10%,transparent)] p-4 text-sm text-[var(--available)]">{message}</p>}
      <div className="mt-8 grid gap-8 xl:grid-cols-[1fr_360px]">
        <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--paper-raised)] shadow-sm">
          <div className="border-b border-[var(--line)] p-5">
            <h2 className="font-display font-semibold text-[var(--ink)]">Stall inventory</h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">{stalls.length} configured · {stalls.filter((s) => s.status === "AVAILABLE").length} available</p>
          </div>
          {loading ? (
            <p className="p-8 text-[var(--ink-soft)]">Loading inventory…</p>
          ) : stalls.length === 0 ? (
            <p className="p-10 text-center text-[var(--ink-soft)]">No stalls configured for this hall.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-[var(--paper)] text-[var(--ink-soft)]"><tr><th className="px-5 py-3">Stall</th><th className="px-5 py-3">Area</th><th className="px-5 py-3">Price</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Action</th></tr></thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {stalls.map((s) => (
                    <tr key={s._id}>
                      <td className="px-5 py-4 font-mono font-medium text-[var(--ink)]">{s.stallNumber}<span className="ml-2 text-[var(--ink-faint)]">{s.section}</span></td>
                      <td className="px-5 py-4 font-mono tabular">{s.area}</td>
                      <td className="px-5 py-4 font-mono tabular">{s.basePrice.toLocaleString()} {s.currency}</td>
                      <td className="px-5 py-4"><StatusBadge status={s.status} /></td>
                      <td className="px-5 py-4"><button onClick={() => setEditing(s)} className="rounded-md border border-[var(--line-strong)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)]">Edit</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <aside className="corner-marks h-fit rounded-2xl border border-[var(--line)] bg-[var(--paper-raised)] p-6 shadow-sm">
          <h2 className="font-display font-semibold text-[var(--ink)]">{editing ? `Edit ${editing.stallNumber}` : "Add bookable stall"}</h2>
          <p className="mb-4 mt-1 text-sm text-[var(--ink-soft)]">{editing ? "Update pricing, visibility or booking status." : "Link a map rectangle to a bookable inventory item."}</p>
          {form(editing)}
        </aside>
      </div>
    </main>
  );
}
