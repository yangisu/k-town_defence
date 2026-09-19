/**
 * The brand mark: a shield for defending a place, with a map pin cut out of it
 * for the place itself. Its parts read from CSS variables so one mark can sit
 * on paper as a solid shape and on the dark rail as a white outline, without a
 * second drawing to keep in step.
 */
export function KTownMark({ size = 56, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      className={`ktown-mark ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label="K-Town Defense"
      focusable="false"
    >
      <path
        d="M24 2.6 41.4 8.5a1.6 1.6 0 0 1 1.1 1.5v12.9c0 9.9-6.4 18.8-16.9 22.4a2.4 2.4 0 0 1-1.6 0C13.5 41.7 5.5 32.8 5.5 22.9V10a1.6 1.6 0 0 1 1.1-1.5Z"
        fill="var(--mark-shield, currentColor)"
        stroke="var(--mark-stroke, transparent)"
        strokeWidth="var(--mark-stroke-width, 0)"
        strokeLinejoin="round"
      />
      <path
        d="M24 11.8c4.6 0 8.3 3.7 8.3 8.3 0 5.9-6.2 12.2-7.8 13.7a.8.8 0 0 1-1 0c-1.6-1.5-7.8-7.8-7.8-13.7 0-4.6 3.7-8.3 8.3-8.3Z"
        fill="var(--mark-pin, var(--paper, #f3f1e8))"
      />
      <circle cx="24" cy="20" r="3.5" fill="var(--mark-dot, var(--leaf, #8cc63f))" />
    </svg>
  );
}
