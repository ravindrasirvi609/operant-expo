export function StatCard({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="corner-marks rounded-xl border border-[var(--line)] bg-[var(--paper-raised)] p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--ink-soft)]">{label}</p>
      <p className="mt-2 font-display text-3xl font-semibold tabular text-[var(--ink)]">{value}</p>
      {hint && <p className="mt-1 text-xs text-[var(--ink-faint)]">{hint}</p>}
    </div>
  );
}
