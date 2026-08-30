export function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-[var(--brand-quiet)]">
      <span className="inline-block h-px w-4 bg-[var(--brand)]" aria-hidden />
      {children}
    </p>
  );
}
