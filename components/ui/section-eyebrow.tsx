export function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-[var(--accent-ink)] dark:text-[var(--accent)]">
      <span className="inline-block h-px w-4 bg-[var(--accent)]" aria-hidden />
      {children}
    </p>
  );
}
