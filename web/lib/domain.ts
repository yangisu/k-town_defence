export type PlaceCategory = "kpop" | "culture" | "local_food" | "event";
export type CheckInDecision = "pending" | "approved" | "review_required" | "rejected";

export interface Region {
  id: string;
  nameKo: string;
  shortCopy: string;
  description: string;
  expeditionCount: number;
  ownerFandom: string;
  ownerArtist: string;
  ownershipPercent: number;
  position: { x: number; y: number };
  accent: "purple" | "orange" | "blue" | "green" | "pink";
  highlights: string[];
}

export interface Place {
  id: string;
  regionId: string;
  nameKo: string;
  category: PlaceCategory;
  categoryLabel: string;
  description: string;
  address: string;
  transit: string;
  dwellMinutes: number;
  points: number;
  localBenefit?: string;
  completed?: boolean;
}

export interface PlaceFilter {
  regionId?: string;
  category?: PlaceCategory;
}

export interface Expedition {
  id: string;
  regionId: string;
  title: string;
  kicker: string;
  description: string;
  duration: string;
  transitMode: string;
  stopIds: string[];
  completedStops: number;
  totalPoints: number;
  weekendBonus: number;
}

export interface BattleSnapshot {
  regionId: string;
  ownerFandom: string;
  challengerFandom: string;
  ownerPercent: number;
  challengerPercent: number;
  pointsToCapture: number;
  recentChange: string;
}

export interface LeaderboardEntry {
  rank: number;
  fandomName: string;
  artistName: string;
  strongholds: number;
  points: number;
  trend: "up" | "down" | "same";
}

export interface JourneyVisit {
  regionName: string;
  placeName: string;
  status: "approved" | "review_required" | "rejected";
  date: string;
}

export interface JourneySummary {
  visitedRegions: number;
  completedExpeditions: number;
  totalPoints: number;
  fandomContributionPercent: number;
  reviewCount: number;
  stamps: string[];
  visits: JourneyVisit[];
}

export interface CheckInSession {
  id: string;
  placeId: string;
  expiresAt: string;
  status?: "collecting" | "ready" | "submitted" | "expired" | "cancelled";
}

export interface CheckInResult {
  decision: CheckInDecision;
  awardedPoints?: number;
  pointsToCapture?: number;
  message: string;
}

export interface GpsEvidence {
  sequence: number;
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  capturedAt: string;
}

export interface PhotoEvidence {
  storageKey: string;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  sizeBytes: number;
  sha256: string;
  capturedAt: string;
}

export interface TourismService {
  listRegions(): Promise<Region[]>;
  getRegion(regionId: string): Promise<Region>;
  listPlaces(filter: PlaceFilter): Promise<Place[]>;
}

export interface ExpeditionService {
  listByRegion(regionId: string): Promise<Expedition[]>;
  get(expeditionId: string): Promise<Expedition>;
}

export interface CheckInService {
  create(placeId: string): Promise<CheckInSession>;
  restore(): Promise<CheckInSession | null>;
  recordGps(sessionId: string, evidence: GpsEvidence): Promise<void>;
  recordPhoto(sessionId: string, evidence: PhotoEvidence): Promise<void>;
  submit(sessionId: string, idempotencyKey: string): Promise<CheckInResult>;
}

export interface BattleService {
  getRegion(regionId: string): Promise<BattleSnapshot>;
  getLeaderboard(): Promise<LeaderboardEntry[]>;
  getJourney(): Promise<JourneySummary>;
}

export interface AppServices {
  tourism: TourismService;
  expeditions: ExpeditionService;
  checkIn: CheckInService;
  battle: BattleService;
}
