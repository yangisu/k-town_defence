import type {
  AppServices,
  CheckInResult,
  CheckInSession,
  GpsEvidence,
  PhotoEvidence,
  Place,
  PlaceFilter,
} from "./domain";
import { services as demoServices } from "./demo-services";

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

export class KTownApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
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
    contentTypeId: dto.contentTypeId ?? undefined,
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
  };
}
