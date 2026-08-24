export function OrbMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden className={className}>
      <circle cx="16" cy="16" r="13.25" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="6.25" fill="currentColor" />
      <circle cx="13.6" cy="13.4" r="1.8" fill="white" opacity="0.82" />
    </svg>
  );
}
