export default function SafetyBanner() {
  return (
    <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <div className="flex items-start gap-2">
        <span className="text-base">⚠️</span>
        <div>
          <div className="font-semibold">Potential red flag detected</div>
          <div>
            Your description mentions symptoms that may need prompt evaluation. Consider seeing a
            clinician (sports medicine physician or urgent care) rather than self-managing.
          </div>
        </div>
      </div>
    </div>
  );
}
