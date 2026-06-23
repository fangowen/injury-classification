export default function SafetyBanner() {
  return (
    <div className="rounded-2xl border border-amber-600/30 bg-amber-50/70 px-5 py-4 text-sm text-amber-900">
      <div className="flex items-start gap-3">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0 text-amber-700">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <div className="min-w-0">
          <div className="font-semibold">Potential red flag detected</div>
          <div className="mt-0.5 text-amber-900/80">
            Your description mentions symptoms that may need prompt evaluation. Consider seeing
            a clinician (sports medicine physician or urgent care) rather than self-managing.
          </div>
        </div>
      </div>
    </div>
  );
}
