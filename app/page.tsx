import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DimensionDivider } from "@/components/ui/dimension-divider";
import { SectionEyebrow } from "@/components/ui/section-eyebrow";
import { StatusBadge } from "@/components/ui/status-badge";
import { statusColor } from "@/lib/ui/status";

const stalls = [
  { id: "A12", status: "AVAILABLE" },
  { id: "A13", status: "AVAILABLE" },
  { id: "B08", status: "HELD" },
  { id: "B09", status: "AVAILABLE" },
  { id: "C21", status: "BOOKED" },
  { id: "C22", status: "AVAILABLE" },
  { id: "D04", status: "BLOCKED" },
];

const LEGEND = ["AVAILABLE", "HELD", "BOOKED"] as const;

function stallFill(status: string) {
  return `color-mix(in srgb, ${statusColor(status)} 24%, transparent)`;
}

export default function Home() {
  return (
    <main className="bg-[var(--paper)]">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <Link href="/" className="flex items-center gap-2 font-display text-lg font-semibold text-[var(--ink)]">
          <span className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--ink)] bg-[var(--ink)] font-mono text-sm text-[var(--paper)]">OE</span>
          Operant Expo
        </Link>
        <div className="flex gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/register">Start free</Link>
          </Button>
        </div>
      </nav>

      <section className="bg-blueprint-grid">
        <div className="mx-auto grid max-w-7xl items-center gap-14 px-6 pb-24 pt-16 lg:grid-cols-2">
          <div>
            <SectionEyebrow>Exhibition space, drawn to scale</SectionEyebrow>
            <h1 className="mt-5 font-display text-5xl font-semibold leading-[1.05] tracking-tight text-[var(--ink)] sm:text-6xl">
              Turn your floor plan into a <span className="text-[var(--brand-quiet)]">bookable layout.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-[var(--ink-soft)]">
              Upload a floor plan, mark out every stall to exact coordinates, and let exhibitors reserve space directly from the map — no spreadsheets, no double-bookings.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/register">Create your workspace</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/login">Sign in</Link>
              </Button>
            </div>
            <DimensionDivider className="mt-10 max-w-xs" />
            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-[var(--ink-soft)]">
              <span>Server-verified holds</span>
              <span>Zero double-booking</span>
              <span>Embeddable booking widget</span>
            </div>
          </div>

          <Card className="corner-marks p-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-[var(--line)] pb-4">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-widest text-[var(--brand-quiet)]">Live floor plan</p>
                <p className="mt-1 font-display font-semibold text-[var(--ink)]">Future Mobility Expo · Hall 1</p>
              </div>
              <StatusBadge status="BOOKING_OPEN" />
            </div>
            <div className="relative mt-4 aspect-[4/3] overflow-hidden rounded-lg bg-blueprint-grid">
              <div className="absolute left-[45%] top-0 h-full border-l border-[var(--line-strong)]" />
              {stalls.map((stall, i) => (
                <div
                  key={stall.id}
                  className="absolute flex h-16 w-20 items-center justify-center rounded border font-mono text-xs font-semibold text-[var(--ink)]"
                  style={{
                    left: `${10 + (i % 4) * 21}%`,
                    top: `${18 + Math.floor(i / 4) * 46}%`,
                    backgroundColor: stallFill(stall.status),
                    borderColor: statusColor(stall.status),
                  }}
                >
                  {stall.id}
                </div>
              ))}
              <div className="absolute left-[41%] top-[39%] rounded-md border-2 border-dashed border-[var(--brand)] bg-[var(--paper-raised)]/80 px-3 py-5 text-xs font-semibold text-[var(--brand-quiet)]">
                Lounge zone
              </div>
              <div className="absolute bottom-3 left-3 flex gap-3 rounded-md bg-[var(--card)]/90 px-3 py-2 font-mono text-[10px] text-[var(--ink-soft)]">
                {LEGEND.map((status) => (
                  <span key={status} className="flex items-center gap-1.5">
                    <span
                      className="size-1.5 rounded-full"
                      style={{ backgroundColor: statusColor(status) }}
                      aria-hidden
                    />
                    {status.charAt(0) + status.slice(1).toLowerCase()}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex justify-between pt-4 font-mono text-xs text-[var(--ink-soft)]">
              <span>47 stalls · 68% occupied</span>
              <span className="text-[var(--brand-quiet)]">View live map</span>
            </div>
          </Card>
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
        <Button asChild size="lg" className="mt-8">
          <Link href="/register">Start building for free</Link>
        </Button>
      </section>

      <footer className="border-t border-[var(--line)] px-6 py-8 text-center text-sm text-[var(--ink-soft)]">
        © 2026 Operant Expo · Interactive space commerce for modern exhibitions.
      </footer>
    </main>
  );
}

function Feature({ title, text }: { title: string; text: string }) {
  return (
    <Card className="corner-marks p-6 text-left">
      <h3 className="font-display text-lg font-semibold text-[var(--ink)]">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">{text}</p>
    </Card>
  );
}
