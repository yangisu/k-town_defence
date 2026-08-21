import type {
  AppServices,
  CheckInResult,
  CheckInSession,
  GpsEvidence,
  PhotoEvidence,
  Place,
  PlaceFilter,
  FandomSummary,
  ExpeditionRecommendationFilter,
  LiveExpedition,
  OpenDataStatus,
  SeasonMembership,
} from "./domain";
import { services as demoServices } from "./demo-services";
import { ApiError } from "./api/api-error";

type PlaceDto = {
  id: string;
  contentId: string | null;
  nameKo: string;
  addressKo: string;
  latitude: number;
  longitude: number;
  regionCode: string;
  descriptionKo: string;
  category?: Place["category"];
  contentTypeId?: string | null;
  imageUrl?: string | null;
  homepageUrl?: string | null;
  telephone?: string | null;
  openTime?: string | null;
  restDate?: string | null;
  parking?: string | null;
  imageUrls?: string[];
  festivalStartDate?: string | null;
  festivalEndDate?: string | null;
  discoveryKeywords?: string[];
  sourceOperations?: string[];
  syncedAt?: string | null;
};

type CheckInDto = {
  id: string;
  placeId: string;
  status: CheckInSession["status"];
  expiresAt: string;
};

const regionIds: Record<string, string> = {
  "1": "seoul",
  "6": "busan",
  "31": "gyeongju",
  "32": "gangneung",
  "37": "jeonju",
};

export class KTownApiError extends ApiError {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(status, code); this.message = message;
  }
}

async function requestJson<T>(
  fetcher: typeof fetch,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetcher(`/api/ktown${path}`, {
    ...init,
    headers: {
      ...(init.body && !(init.body instanceof FormData) ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  const body = (await response.json().catch(() => null)) as
    | { code?: string; message?: string }
    | T
    | null;
  if (!response.ok) {
    const error = body as { code?: string; message?: string } | null;
    throw new KTownApiError(
      error?.code ?? "KTOWN_API_ERROR",
      error?.message ?? "K-Town API 요청에 실패했습니다.",
      response.status,
    );
  }
  return body as T;
}

function mapPlace(dto: PlaceDto): Place {
  return {
    id: dto.id,
    regionId: regionIds[dto.regionCode] ?? dto.regionCode,
    nameKo: dto.nameKo,
    category: dto.category ?? "culture",
    categoryLabel: dto.category === "local_food" ? "먹거리" : dto.category === "event" ? "행사" : "관광 명소",
    description: dto.descriptionKo,
    address: dto.addressKo,
    transit: "운영자가 확인한 교통 안내를 준비 중입니다.",
    dwellMinutes: 5,
    points: 0,
    latitude: dto.latitude,
    longitude: dto.longitude,
    imageUrl: dto.imageUrl ?? undefined,
    imageUrls: dto.imageUrls,
    contentTypeId: dto.contentTypeId ?? undefined,
    homepageUrl: dto.homepageUrl ?? undefined,
    telephone: dto.telephone ?? undefined,
    openTime: dto.openTime ?? undefined,
    restDate: dto.restDate ?? undefined,
    parking: dto.parking ?? undefined,
    festivalStartDate: dto.festivalStartDate ?? undefined,
    festivalEndDate: dto.festivalEndDate ?? undefined,
    discoveryKeywords: dto.discoveryKeywords,
    sourceOperations: dto.sourceOperations,
    syncedAt: dto.syncedAt ?? undefined,
  };
}

function invalidResponse(): never {
  throw new KTownApiError("INVALID_RESPONSE", "관광 데이터 응답 형식이 올바르지 않습니다.", 502);
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalidResponse();
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) invalidResponse();
  return value;
}

function finiteNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) invalidResponse();
  return value;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) invalidResponse();
  return value as string[];
}

function nullableText(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  return text(value);
}

const placeCategories = new Set<Place["category"]>(["kpop", "culture", "local_food", "event"]);

function category(value: unknown): Place["category"] {
  const parsed = text(value) as Place["category"];
  if (!placeCategories.has(parsed)) invalidResponse();
  return parsed;
}

function isoDate(value: unknown): string {
  const parsed = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed)) invalidResponse();
  const date = new Date(`${parsed}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== parsed) invalidResponse();
  return parsed;
}

function timestamp(value: unknown): string {
  const parsed = text(value);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(parsed)) invalidResponse();
  if (Number.isNaN(Date.parse(parsed))) invalidResponse();
  return parsed;
}

function httpsUrl(value: unknown): string {
  const parsed = text(value);
  try {
    const url = new URL(parsed);
    if (url.protocol !== "https:" || url.username || url.password) invalidResponse();
  } catch {
    invalidResponse();
  }
  return parsed;
}

function nullableDate(value: unknown): string | undefined {
  return value === null || value === undefined ? undefined : isoDate(value);
}

function nullableTimestamp(value: unknown): string | undefined {
  return value === null || value === undefined ? undefined : timestamp(value);
}

function nullableHttpsUrl(value: unknown): string | undefined {
  return value === null || value === undefined ? undefined : httpsUrl(value);
}

function mapEnrichedPlace(value: unknown): Place {
  const dto = object(value);
  const mapped: PlaceDto = {
    id: text(dto.id),
    contentId: dto.contentId === null ? null : text(dto.contentId),
    nameKo: text(dto.nameKo),
    addressKo: text(dto.addressKo),
    latitude: finiteNumber(dto.latitude),
    longitude: finiteNumber(dto.longitude),
    regionCode: text(dto.regionCode),
    descriptionKo: text(dto.descriptionKo),
    category: category(dto.category),
    contentTypeId: nullableText(dto.contentTypeId),
    imageUrl: nullableHttpsUrl(dto.imageUrl),
    homepageUrl: nullableHttpsUrl(dto.homepageUrl),
    telephone: nullableText(dto.telephone),
    openTime: nullableText(dto.openTime),
    restDate: nullableText(dto.restDate),
    parking: nullableText(dto.parking),
    imageUrls: stringArray(dto.imageUrls).map(httpsUrl),
    festivalStartDate: nullableDate(dto.festivalStartDate),
    festivalEndDate: nullableDate(dto.festivalEndDate),
    discoveryKeywords: stringArray(dto.discoveryKeywords),
    sourceOperations: stringArray(dto.sourceOperations),
    syncedAt: nullableTimestamp(dto.syncedAt),
  };
  return mapPlace(mapped);
}

function mapExpedition(value: unknown): LiveExpedition {
  const dto = object(value);
  if (!Array.isArray(dto.stops)) invalidResponse();
  return {
    id: text(dto.id),
    title: text(dto.title),
    regionCode: text(dto.regionCode),
    keyword: nullableText(dto.keyword),
    travelDate: isoDate(dto.travelDate),
    dataUpdatedAt: nullableTimestamp(dto.dataUpdatedAt),
    stops: dto.stops.map((value) => {
      const stop = object(value);
      return {
        order: finiteNumber(stop.order),
        distanceKm: finiteNumber(stop.distanceKm),
        reasons: stringArray(stop.reasons),
        place: mapEnrichedPlace(stop.place),
      };
    }),
  };
}

function mapOpenDataStatus(value: unknown): OpenDataStatus {
  const dto = object(value);
  if (!Array.isArray(dto.operations)) invalidResponse();
  return {
    label: text(dto.label),
    lastSuccessfulSyncAt: nullableTimestamp(dto.lastSuccessfulSyncAt),
    activePlaceCount: finiteNumber(dto.activePlaceCount),
    operations: dto.operations.map((value) => {
      const item = object(value);
      return {
        operation: text(item.operation),
        lastSucceededAt: timestamp(item.lastSucceededAt),
        responseCount: finiteNumber(item.responseCount),
      };
    }),
  };
}

export function createHttpServices(fetcher: typeof fetch = fetch): AppServices {
  let restoredSession: CheckInSession | null = null;

  return {
    tourism: {
      listRegions: () => demoServices.tourism.listRegions(),
      getRegion: (regionId) => demoServices.tourism.getRegion(regionId),
      async listPlaces(filter: PlaceFilter) {
        const params = new URLSearchParams();
        const backendRegionCodes: Record<string, string> = { busan: "6" };
        if (filter.regionId) params.set("regionCode", backendRegionCodes[filter.regionId] ?? filter.regionId);
        if (filter.category) params.set("category", filter.category);
        if (filter.query?.trim()) params.set("query", filter.query.trim());
        const suffix = params.size > 0 ? `?${params.toString()}` : "";
        const response = await requestJson<{ items: PlaceDto[] }>(
          fetcher,
          `/api/v1/places${suffix}`,
        );
        return response.items.map(mapPlace);
      },
      async getRecommendedExpedition(filter: ExpeditionRecommendationFilter) {
        const params = new URLSearchParams({
          regionCode: filter.regionCode,
          travelDate: filter.travelDate,
          limit: String(filter.limit),
        });
        if (filter.keyword?.trim()) params.set("keyword", filter.keyword.trim());
        const response = await requestJson<unknown>(
          fetcher,
          `/api/v1/expeditions/recommended?${params.toString()}`,
        );
        return mapExpedition(response);
      },
      async getOpenDataStatus() {
        return mapOpenDataStatus(
          await requestJson<unknown>(fetcher, "/api/v1/open-data/status"),
        );
      },
    },
    expeditions: demoServices.expeditions,
    checkIn: {
      async create(placeId) {
        const dto = await requestJson<CheckInDto>(fetcher, "/api/v1/checkins", {
          method: "POST",
          body: JSON.stringify({ placeId }),
        });
        restoredSession = dto;
        return dto;
      },
      async restore() {
        return restoredSession ? structuredClone(restoredSession) : null;
      },
      async recordGps(sessionId: string, evidence: GpsEvidence) {
        await requestJson(fetcher, `/api/v1/checkins/${sessionId}/gps`, {
          method: "POST",
          body: JSON.stringify(evidence),
        });
      },
      async recordPhoto(sessionId: string, evidence: PhotoEvidence) {
        const form = new FormData();
        form.set("file", evidence.file);
        form.set("capturedAt", evidence.capturedAt);
        await requestJson(fetcher, `/api/v1/checkins/${sessionId}/photo`, {
          method: "POST",
          body: form,
        });
      },
      async submit(sessionId, idempotencyKey): Promise<CheckInResult> {
        const result = await requestJson<{ decision: "pending" }>(
          fetcher,
          `/api/v1/checkins/${sessionId}/submit`,
          {
            method: "POST",
            headers: { "Idempotency-Key": idempotencyKey },
          },
        );
        return {
          decision: result.decision,
          message: "체크인 제출이 접수되었습니다. 검토를 기다려 주세요.",
        };
      },
    },
    battle: demoServices.battle,
    membership: {
      async listFandoms() {
        return (await requestJson<{ items: FandomSummary[] }>(fetcher, "/api/v1/fandoms")).items;
      },
      getCurrent: () => requestJson<SeasonMembership | null>(fetcher, "/api/v1/me/season-membership"),
      selectFandom: (fandomId) => requestJson<SeasonMembership>(fetcher, "/api/v1/me/season-membership", { method: "PUT", body: JSON.stringify({ fandomId }) }),
    },
  };
}
