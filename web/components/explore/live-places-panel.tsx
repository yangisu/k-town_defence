"use client";

import type { Place, TourismService } from "@/lib/domain";
import { LiveExpeditionPanel } from "@/components/expedition/live-expedition-panel";


export function LivePlacesPanel({ service, onStartCheckIn }: { service: TourismService; onStartCheckIn: (place: Place) => void }) {
  return <LiveExpeditionPanel service={service} onStartCheckIn={onStartCheckIn} />;
}
