import { buildShareCard } from "@/features/share/build-share-card";

export type ShareSubject = { title: string; description: string };

type PlaceResponse = { nameKo: string; descriptionKo: string };

/**
 * Resolves the public content for a shared link. Runs on the server for
 * both the share page and its OG image, so a visitor who is not the
 * original sharer sees the same generic, already-public content — never a
 * specific user's points, GPS trail, or private evidence.
 */
export async function fetchShareSubject(
  kind: string,
  id: string,
  searchParams: URLSearchParams,
): Promise<ShareSubject | null> {
  if (kind === "checkin") {
    const backendBaseUrl = process.env.KTOWN_API_BASE_URL;
    if (!backendBaseUrl) return null;
    const gatewaySecret = process.env.KTOWN_GATEWAY_SECRET;
    const response = await fetch(`${backendBaseUrl.replace(/\/$/, "")}/api/v1/places/${id}`, {
      headers: gatewaySecret ? { "x-ktown-gateway-secret": gatewaySecret } : undefined,
    });
    if (!response.ok) return null;
    const place = (await response.json()) as PlaceResponse;
    const card = buildShareCard("checkin", { placeId: id, placeName: place.nameKo });
    return { title: card.title, description: card.description };
  }

  if (kind === "territory" && id === "current") {
    const fandomName = searchParams.get("fandom");
    const ownedCount = Number(searchParams.get("owned"));
    if (!fandomName || !Number.isFinite(ownedCount)) return null;
    const card = buildShareCard("territory", {
      fandomName,
      ownedCount,
      strongestTerritoryName: searchParams.get("strongest"),
    });
    return { title: card.title, description: card.description };
  }

  return null;
}
