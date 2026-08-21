"use client";

import { useMemo, useReducer } from "react";
import { AppShell } from "@/components/app-shell";
import { ExploreView } from "@/components/explore/explore-view";
import { ExpeditionView } from "@/components/expedition/expedition-view";
import { CheckInFlow } from "@/components/check-in/check-in-flow";
import { BattleView } from "@/components/battle/battle-view";
import { JourneyView } from "@/components/journey/journey-view";
import { appReducer, initialAppState } from "@/features/app-controller";
import { places } from "@/lib/demo-data";
import { services } from "@/lib/demo-services";

export default function Page() {
  const [state, dispatch] = useReducer(appReducer, initialAppState);
  const checkInPlace = useMemo(() => places.find((place) => place.id === state.checkInPlaceId), [state.checkInPlaceId]);
  return <AppShell activeTab={state.activeTab} onTabChange={(tab) => dispatch({ type: "changeTab", tab })}>
    {state.activeTab === "explore" ? <ExploreView services={services} selectedRegionId={state.selectedRegionId} onSelectRegion={(regionId) => dispatch({ type: "selectRegion", regionId })} onOpenExpedition={(regionId, expeditionId) => dispatch({ type: "openExpedition", regionId, expeditionId })} /> : null}
    {state.activeTab === "expedition" ? <ExpeditionView expeditionId={state.selectedExpeditionId} services={services} onStartCheckIn={(placeId) => dispatch({ type: "startCheckIn", placeId })} onBack={() => dispatch({ type: "changeTab", tab: "explore" })} /> : null}
    {state.activeTab === "battle" ? <BattleView service={services.battle} selectedRegionId={state.selectedRegionId} /> : null}
    {state.activeTab === "journey" ? <JourneyView service={services.battle} /> : null}
    {checkInPlace ? <CheckInFlow place={checkInPlace} service={services.checkIn} onClose={() => dispatch({ type: "closeCheckIn" })} /> : null}
  </AppShell>;
}
