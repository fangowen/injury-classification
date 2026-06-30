export default function SafetyBanner() {
  // Inversion for emphasis — the monochrome system's substitute for a colored alert.
  return (
    <div className="bg-fg px-6 py-5 text-bg">
      <div className="flex items-start gap-4">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <div className="min-w-0">
          <div className="font-mono text-xs font-semibold uppercase tracking-widest">
            Potential red flag detected
          </div>
          <div className="mt-1.5 font-serif text-[15px] leading-relaxed text-bg/85">
            Your description mentions symptoms that may need prompt evaluation. Consider seeing
            a clinician (sports medicine physician or urgent care) rather than self-managing.
          </div>
        </div>
      </div>
    </div>
  );
}
