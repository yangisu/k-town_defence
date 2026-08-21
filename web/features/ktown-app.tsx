"use client";

import { useMemo, useReducer, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { ExploreView } from "@/components/explore/explore-view";
import { ExpeditionView } from "@/components/expedition/expedition-view";
import { CheckInFlow } from "@/components/check-in/check-in-flow";
import { BattleView } from "@/components/battle/battle-view";
import { JourneyView } from "@/components/journey/journey-view";
import { appReducer, initialAppState } from "@/features/app-controller";
import type { Place } from "@/lib/domain";
import { createServices, type ServiceMode } from "@/lib/service-factory";
import { MembershipProvider } from "@/features/membership/membership-context";
import { MembershipGate } from "@/components/membership/membership-gate";

export function KTownApp({ mode }: { mode: ServiceMode }) {
  const services = useMemo(() => createServices(mode), [mode]);
  const [state, dispatch] = useReducer(appReducer, initialAppState);
  const [checkInPlace, setCheckInPlace] = useState<Place | null>(null);

  return <MembershipProvider service={services.membership}><MembershipGate><AppShell activeTab={state.activeTab} onTabChange={(tab) => dispatch({ type: "changeTab", tab })}>
    {state.activeTab === "explore" ? <ExploreView services={services} mode={mode} selectedRegionId={state.selectedRegionId} onSelectRegion={(regionId) => dispatch({ type: "selectRegion", regionId })} onOpenExpedition={(regionId, expeditionId) => dispatch({ type: "openExpedition", regionId, expeditionId })} onStartCheckIn={(place) => { setCheckInPlace(place); dispatch({ type: "startCheckIn", placeId: place.id }); }} /> : null}
    {state.activeTab === "expedition" ? <ExpeditionView expeditionId={state.selectedExpeditionId} services={services} onStartCheckIn={(place) => { setCheckInPlace(place); dispatch({ type: "startCheckIn", placeId: place.id }); }} onBack={() => dispatch({ type: "changeTab", tab: "explore" })} /> : null}
    {state.activeTab === "battle" ? <BattleView service={services.battle} selectedRegionId={state.selectedRegionId} /> : null}
    {state.activeTab === "journey" ? <JourneyView service={services.battle} /> : null}
    {checkInPlace ? <CheckInFlow place={checkInPlace} service={services.checkIn} mode={mode} onClose={() => { setCheckInPlace(null); dispatch({ type: "closeCheckIn" }); }} /> : null}
  </AppShell></MembershipGate></MembershipProvider>;
}
