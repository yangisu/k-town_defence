export type AppTab = "explore" | "expedition" | "battle" | "journey";

export interface AppState {
  activeTab: AppTab;
  selectedRegionId: string;
  selectedPlaceId: string | null;
  selectedExpeditionId: string | null;
  checkInPlaceId: string | null;
}

export type AppAction =
  | { type: "changeTab"; tab: AppTab }
  | { type: "selectRegion"; regionId: string }
  | { type: "selectPlace"; placeId: string }
  | { type: "openExpedition"; regionId: string; expeditionId: string }
  | { type: "startCheckIn"; placeId: string }
  | { type: "closeCheckIn" };

export const initialAppState: AppState = {
  activeTab: "explore",
  selectedRegionId: "busan",
  selectedPlaceId: null,
  selectedExpeditionId: null,
  checkInPlaceId: null,
};

export function openExpedition(regionId: string, expeditionId: string): AppAction {
  return { type: "openExpedition", regionId, expeditionId };
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "changeTab": return { ...state, activeTab: action.tab, checkInPlaceId: null };
    case "selectRegion": return { ...state, selectedRegionId: action.regionId };
    case "selectPlace": return { ...state, selectedPlaceId: action.placeId };
    case "openExpedition": return { ...state, activeTab: "expedition", selectedRegionId: action.regionId, selectedExpeditionId: action.expeditionId };
    case "startCheckIn": return { ...state, checkInPlaceId: action.placeId };
    case "closeCheckIn": return { ...state, checkInPlaceId: null };
  }
}
