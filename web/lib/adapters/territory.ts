import { previewContent } from "@/features/team-preview/content";
import { artistIdForFandom } from "@/features/team-preview/fandom-artists";
import type { ArtistId, PreviewTerritory } from "@/features/team-preview/types";
import type { TerritorySnapshot } from "@/lib/domain";

export function mapTerritorySnapshots(snapshots: TerritorySnapshot[]): PreviewTerritory[] {
  return snapshots.flatMap((snapshot) => {
    const artistByFandomId = new Map<string, ArtistId>();
    const standings = snapshot.standings.map((standing) => {
      // A fandom a member named has no catalogued artist behind it, and
      // dropping it took the whole territory with it once it held one.
      const artist = previewContent.artists.find((candidate) => candidate.fandomName === standing.fandomName);
      const artistId = artist?.id ?? artistIdForFandom(standing.fandomId);
      artistByFandomId.set(standing.fandomId, artistId);
      return { artistId, fandomName: standing.fandomName, validPoints: standing.validPoints };
    });
    const ownerArtistId = artistByFandomId.get(snapshot.ownerFandomId);
    if (!ownerArtistId || standings.length === 0) return [];
    return [{
      id: snapshot.id,
      name: { ko: snapshot.nameKo, en: snapshot.nameEn },
      centroid: { latitude: snapshot.latitude, longitude: snapshot.longitude },
      populationDecline: snapshot.populationDecline,
      balanceMultiplier: snapshot.balanceMultiplier,
      balanceReason: { ko: snapshot.balanceReasonKo, en: snapshot.balanceReasonEn },
      sourceUrls: [],
      ownerArtistId,
      strongholdStage: snapshot.strongholdStage,
      standings,
    }];
  });
}
