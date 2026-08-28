import Link from "next/link";

import { SectionEyebrow } from "@/components/ui/section-eyebrow";
import { DimensionDivider } from "@/components/ui/dimension-divider";

const stalls = [
  { id: "A12", status: "AVAILABLE" },
  { id: "A13", status: "AVAILABLE" },
  { id: "B08", status: "HELD" },
  { id: "B09", status: "AVAILABLE" },
  { id: "C21", status: "BOOKED" },
  { id: "C22", status: "AVAILABLE" },
  { id: "D04", status: "BLOCKED" },
];

const statusFill: Record<string, string> = {
  AVAILABLE: "color-mix(in srgb, var(--available) 22%, transparent)",
  HELD: "color-mix(in srgb, var(--held) 26%, transparent)",
  BOOKED: "color-mix(in srgb, var(--booked) 26%, transparent)",
  BLOCKED: "color-mix(in srgb, var(--blocked) 22%, transparent)",
};

const statusBorder: Record<string, string> = {
  AVAILABLE: "var(--available)",
  HELD: "var(--held)",
  BOOKED: "var(--booked)",
  BLOCKED: "var(--blocked)",
};

export default function Home() {
  return (
    <main className="bg-[var(--paper)]">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <Link href="/" className="flex items-center gap-2 font-display text-lg font-semibold text-[var(--ink)]">
          <span className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--ink)] bg-[var(--ink)] font-mono text-sm text-[var(--paper)]">OE</span>
          Operant Expo
        </Link>
        <div className="flex gap-3">
          <Link href="/login" className="rounded-md px-4 py-2 text-sm text-[var(--ink-soft)] hover:text-[var(--ink)]">Sign in</Link>
          <Link href="/register" className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-ink)]">Start free</Link>
        </div>
      </nav>

      <section className="bg-blueprint-grid">
        <div className="mx-auto grid max-w-7xl items-center gap-14 px-6 pb-24 pt-16 lg:grid-cols-2">
          <div>
            <SectionEyebrow>Exhibition space, drawn to scale</SectionEyebrow>
            <h1 className="mt-5 font-display text-5xl font-semibold leading-[1.05] tracking-tight text-[var(--ink)] sm:text-6xl">
              Turn your floor plan into a <span className="text-[var(--accent-ink)] dark:text-[var(--accent)]">bookable layout.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-[var(--ink-soft)]">
              Upload a floor plan, mark out every stall to exact coordinates, and let exhibitors reserve space directly from the map — no spreadsheets, no double-bookings.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/register" className="rounded-md bg-[var(--accent)] px-5 py-3.5 text-center text-sm font-semibold text-[var(--accent-ink)]">
                Create your workspace →
              </Link>
              <Link href="/login" className="rounded-md border border-[var(--line-strong)] px-5 py-3.5 text-center text-sm font-semibold text-[var(--ink)]">
                Sign in
              </Link>
            </div>
            <DimensionDivider className="mt-10 max-w-xs" />
            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-[var(--ink-soft)]">
              <span>Server-verified holds</span>
              <span>Zero double-booking</span>
              <span>Embeddable booking widget</span>
            </div>
          </div>

          <div className="corner-marks rounded-2xl border border-[var(--line)] bg-[var(--paper-raised)] p-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-[var(--line)] pb-4">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-widest text-[var(--accent-ink)] dark:text-[var(--accent)]">Live floor plan</p>
                <p className="mt-1 font-display font-semibold text-[var(--ink)]">Future Mobility Expo · Hall 1</p>
              </div>
              <span className="rounded-full border border-[var(--available)] px-2.5 py-1 text-[11px] font-medium text-[var(--available)]">Booking open</span>
            </div>
            <div className="relative mt-4 aspect-[4/3] overflow-hidden rounded-lg bg-blueprint-grid">
              <div className="absolute left-[45%] top-0 h-full border-l border-[var(--line-strong)]" />
              {stalls.map((stall, i) => (
                <div
                  key={stall.id}
                  className="absolute flex h-16 w-20 items-center justify-center rounded border font-mono text-xs font-semibold text-[var(--ink)]"
                  style={{ left: `${10 + (i % 4) * 21}%`, top: `${18 + Math.floor(i / 4) * 46}%`, backgroundColor: statusFill[stall.status], borderColor: statusBorder[stall.status] }}
                >
                  {stall.id}
                </div>
              ))}
              <div className="absolute left-[41%] top-[39%] rounded-md border-2 border-dashed border-[var(--accent)] bg-[var(--paper-raised)]/80 px-3 py-5 text-xs font-semibold text-[var(--accent-ink)] dark:text-[var(--accent)]">
                Lounge zone
              </div>
              <div className="absolute bottom-3 left-3 flex gap-3 rounded-md bg-[var(--paper-raised)]/90 px-3 py-2 text-[10px] font-mono">
                <span className="text-[var(--available)]">● Available</span>
                <span className="text-[var(--held)]">● Held</span>
                <span className="text-[var(--booked)]">● Booked</span>
              </div>
            </div>
            <div className="flex justify-between pt-4 font-mono text-xs text-[var(--ink-soft)]">
              <span>47 stalls · 68% occupied</span>
              <span className="text-[var(--accent-ink)] dark:text-[var(--accent)]">View live map →</span>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-[var(--line)] py-20">
        <div className="mx-auto max-w-7xl px-6">
          <SectionEyebrow>One connected workspace</SectionEyebrow>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-[var(--ink)] sm:text-4xl">From layout to sold-out floor.</h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            <Feature title="Shape the layout" text="Upload your floor plan and turn it into an accurate, interactive map with stalls, zones and entrances placed to exact coordinates." />
            <Feature title="Make space discoverable" text="Give exhibitors a clear visual way to search, filter and compare every available stall before they reserve one." />
            <Feature title="Operate with confidence" text="Protect every reservation with server-side holds, atomic booking transactions and a full audit trail." />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-24 text-center">
        <SectionEyebrow>Ready when you are</SectionEyebrow>
        <h2 className="mx-auto mt-3 max-w-2xl font-display text-4xl font-semibold tracking-tight text-[var(--ink)]">Make your next exhibition easier to book.</h2>
        <p className="mx-auto mt-4 max-w-xl text-[var(--ink-soft)]">Create your workspace, upload a floor plan and start shaping your public booking experience.</p>
        <Link href="/register" className="mt-8 inline-flex rounded-md bg-[var(--accent)] px-6 py-3.5 text-sm font-semibold text-[var(--accent-ink)]">
          Start building for free →
        </Link>
      </section>

      <footer className="border-t border-[var(--line)] px-6 py-8 text-center text-sm text-[var(--ink-soft)]">
        © 2026 Operant Expo · Interactive space commerce for modern exhibitions.
      </footer>
    </main>
  );
}

function Feature({ title, text }: { title: string; text: string }) {
  return (
    <article className="corner-marks rounded-xl border border-[var(--line)] bg-[var(--paper-raised)] p-6 text-left">
      <h3 className="font-display text-lg font-semibold text-[var(--ink)]">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">{text}</p>
    </article>
  );
}
