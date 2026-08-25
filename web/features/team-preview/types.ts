import type { PlaceCategory } from "@/lib/domain";

export type Locale = "ko" | "en";
export type LocalizedText = Record<Locale, string>;
export type TerritoryId = string;
export type MissionPlaceId = string;
export type ArtistId =
  | "bts" | "blackpink" | "rescene" | "cortis" | "btob"
  | "ive" | "kiiikiii" | "riize" | "zerobaseone"
  | "boynextdoor" | "le-sserafim" | "aespa" | "newjeans"
  | "iu" | "seventeen";
export type EvidenceClass = "official" | "verified" | "team_data";
export type PlaceRelationship = "artist_connection" | "nearby_recommendation";
export type PlaceAccess = "public" | "restricted" | "sensitive";
export type StrongholdStage = "seed" | "tree" | "landmark";
export type SourceReliability = "authoritative" | "reliable_public" | "team_input" | "official_tourism";

export interface ContentSource {
  id: string;
  url: string;
  publisher: string;
  reliability: SourceReliability;
  claimSpecific: boolean;
}

export interface ArtistProfile {
  id: ArtistId;
  artistName: LocalizedText;
  fandomName: string;
  color: string;
  markerLabel: string;
  logoPath?: string;
  representativeTerritoryIds: TerritoryId[];
}

export interface ArtistConnection {
  id: string;
  artistId: ArtistId;
  territoryId: TerritoryId;
  memberName: LocalizedText;
  relationType: "birthplace" | "hometown" | "filming" | "official_activity";
  evidenceClass: EvidenceClass;
  evidenceNote: LocalizedText;
  story: LocalizedText;
  sourceUrls: string[];
  sources: ContentSource[];
}

export interface LocalizedTransportInfo {
  summary: LocalizedText;
  nearestStation: LocalizedText;
  accessibilityNote: LocalizedText;
}

export interface TerritoryStanding {
  artistId: ArtistId;
  fandomName: string;
  validPoints: number;
}

export interface FandomStanding {
  artistId: ArtistId;
  fandomName: string;
  strongholds: number;
  validPoints: number;
  trend: "up" | "down" | "same";
}

export interface PreviewTerritory {
  id: TerritoryId;
  name: LocalizedText;
  centroid: { latitude: number; longitude: number };
  populationDecline: boolean;
  balanceMultiplier: 1 | 1.8;
  balanceReason: LocalizedText;
  sourceUrls: string[];
  ownerArtistId: ArtistId;
  strongholdStage: StrongholdStage;
  standings: TerritoryStanding[];
}

export interface PreviewMissionPlace {
  id: MissionPlaceId;
  territoryId: TerritoryId;
  name: LocalizedText;
  category: PlaceCategory;
  relationship: PlaceRelationship;
  artistConnectionId: string | null;
  evidenceClass: EvidenceClass | null;
  access: PlaceAccess;
  description: LocalizedText;
  address: LocalizedText;
  coordinates: { latitude: number; longitude: number };
  transport: LocalizedTransportInfo;
  dwellMinutes: number;
  visitBase: number;
  localBenefit: LocalizedText;
  sourceUrls: string[];
  sources: ContentSource[];
}

export interface PreviewExpedition {
  id: string;
  artistId: ArtistId | null;
  territoryId: TerritoryId;
  connectionId: string | null;
  title: LocalizedText;
  description: LocalizedText;
  stopIds: MissionPlaceId[];
  transitSummary: LocalizedText;
  estimatedMinutes: number;
}
