export type ShareCard = {
  title: string;
  description: string;
  shareUrl: string;
  imageUrl: string;
};

export type CheckinShareInput = {
  placeId: string;
  placeName: string;
  /** Omit for an integrated check-in, which is always `pending` until operator review. */
  pointsAwarded?: number;
};

export type TerritoryShareInput = {
  fandomName: string;
  ownedCount: number;
  strongestTerritoryName?: string | null;
};

/**
 * Builds the text and public link shown in the share sheet. The description
 * is built only from data already public elsewhere (place names, this user's
 * own point total, current territory standings) — it never touches raw GPS
 * samples, photo evidence, or another user's data.
 */
export function buildShareCard(kind: "checkin", data: CheckinShareInput, origin?: string): ShareCard;
export function buildShareCard(kind: "territory", data: TerritoryShareInput, origin?: string): ShareCard;
export function buildShareCard(
  kind: "checkin" | "territory",
  data: CheckinShareInput | TerritoryShareInput,
  origin = "",
): ShareCard {
  if (kind === "checkin") {
    const { placeId, placeName, pointsAwarded } = data as CheckinShareInput;
    const shareUrl = `${origin}/share/checkin/${placeId}`;
    return {
      title: `${placeName} 체크인 완료!`,
      description: typeof pointsAwarded === "number"
        ? `K-Town Defense에서 ${placeName}을(를) 방문하고 ${pointsAwarded}점을 획득했어요!`
        : `K-Town Defense에서 ${placeName}에 체크인했어요. 운영 검토 후 포인트가 반영돼요.`,
      shareUrl,
      imageUrl: `${shareUrl}/image`,
    };
  }

  const { fandomName, ownedCount, strongestTerritoryName } = data as TerritoryShareInput;
  const query = new URLSearchParams({ fandom: fandomName, owned: String(ownedCount) });
  if (strongestTerritoryName) query.set("strongest", strongestTerritoryName);
  const shareUrl = `${origin}/share/territory/current?${query.toString()}`;
  return {
    title: `${fandomName} 영토 현황`,
    description: strongestTerritoryName
      ? `${fandomName}이(가) 대한민국 ${ownedCount}개 지역을 점유 중! 최강 거점은 ${strongestTerritoryName}이에요.`
      : `${fandomName}이(가) 대한민국 ${ownedCount}개 지역을 점유하고 있어요!`,
    shareUrl,
    imageUrl: `${origin}/share/territory/current/image?${query.toString()}`,
  };
}
