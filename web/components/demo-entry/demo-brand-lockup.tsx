export function DemoBrandLockup({ className = "" }: { className?: string }) {
  return (
    <div className={`demo-brand-lockup ${className}`.trim()} role="img" aria-label="K-Town Defence">
      <span aria-hidden="true">K</span>
      <strong>K-TOWN<br />DEFENCE</strong>
    </div>
  );
}
