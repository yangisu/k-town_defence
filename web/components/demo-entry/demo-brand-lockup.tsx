import { KTownMark } from "@/components/brand/ktown-mark";

/** The shield mark beside the wordmark. One mark across the demo entry, the
 *  brand transition and the sign-in screen, so they read as one product. */
export function DemoBrandLockup({ className = "" }: { className?: string }) {
  return (
    <div className={`demo-brand-lockup ${className}`.trim()}>
      <KTownMark size={56} />
      <strong>K-TOWN<br />DEFENCE</strong>
    </div>
  );
}
