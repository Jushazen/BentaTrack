// Placeholder identity until the owner supplies the official Estetika logo (SRS §2.6, amendment D3).
// Text only by design: no invented symbol.
export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex flex-col leading-none" data-testid="wordmark">
      <span className={`font-display text-text ${compact ? "text-xl" : "text-2xl"}`}>Estetika</span>
      {!compact && (
        <span className="text-muted mt-1 text-[11px] font-medium tracking-[0.18em] uppercase">
          BentaTrack
        </span>
      )}
    </span>
  );
}
