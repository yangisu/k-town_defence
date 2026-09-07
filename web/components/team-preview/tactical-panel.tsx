"use client";

import { useRef, useState, type TouchEvent } from "react";
import { ArrowLeft, ArrowRight, CircleAlert } from "@/components/ui/icons";
import { calculateMissionAward, GAME_RULES, rankFandoms, stageForPoints } from "@/features/team-preview/game-rules";
import { previewContent } from "@/features/team-preview/content";
import { t } from "@/features/team-preview/i18n";
import type { DemoSession } from "@/features/team-preview/demo-session";
import { useDemoSession } from "@/features/team-preview/demo-session-context";
import type {
  ArtistConnection,
  ArtistProfile,
  Locale,
  PreviewExpedition,
  PreviewTerritory,
  TerritoryStanding,
} from "@/features/team-preview/types";
import { StrongholdMark } from "@/components/team-preview/stronghold-mark";

const panelCopy = {
  ko: {
    owner: "현재 소유",
    challenger: "도전자",
    regionalStory: "지역 연결 스토리",
    regionalSupport: "지역의 공공 관광 코스",
    noDirectPlace: "검증된 아티스트 직접 연관 장소가 없어 공공 관광지만 안내합니다.",
    stronghold: "거점 단계",
    seed: "씨앗",
    tree: "나무",
    landmark: "랜드마크",
    defense: "방어 우위",
    capture: "탈환까지",
    build: "거점 성장까지",
    maxStage: "최고 단계 방어 중",
    sourceConnection: "연결 근거 출처",
    sourceTerritory: "영토 자료 출처",
    evidenceDisclosure: "추천 근거 보기",
    evidenceSource: "출처 확인",
    awardTitle: "추천 원정 예상 포인트",
    awardHelp: "포인트 계산 방식 보기",
    awardHelpVisit: "장소마다 정해진 기본 포인트예요. 체크인이 승인되면 지급됩니다.",
    awardHelpDwell: `${GAME_RULES.dwellLongMinutes}분 이상 머물면 ${GAME_RULES.dwell60Minutes}P, ${GAME_RULES.dwellShortMinutes}분 이상이면 ${GAME_RULES.dwell30Minutes}P를 받아요.`,
    awardHelpLocalSpend: `지역 가게에서 쓴 내역을 인증하면 ${GAME_RULES.localSpend}P.`,
    awardHelpAccommodation: `숙박을 인증하면 ${GAME_RULES.accommodation}P.`,
    awardHelpStronghold: `내 팬덤이 소유한 영토에서만 붙어요. 씨앗 +${GAME_RULES.strongholdVisitBonus}P, 나무부터 체류 보너스가 있으면 +${GAME_RULES.strongholdDwellBonus}P, 랜드마크에서 소비를 인증하면 +${GAME_RULES.strongholdSpendBonus}P가 더해집니다.`,
    awardHelpTotalTerm: "합계 뒤",
    awardHelpTotal: `지역 배율을 곱하고, 같은 장소를 반복하면 ${GAME_RULES.repeatDecay.join("배 → ")}배로 줄어요. 하루 상한은 ${GAME_RULES.dailyCap.toLocaleString()}P입니다.`,
    impactTitle: "추천 원정 영향",
    impactHelp: "영향 지표 설명 보기",
    impactHelpBalance: "합계에 곱해지는 지역 배율이에요. 옆 문구는 그 배율이 붙은 근거이고, 방문을 유도할 이유가 있는 지역일수록 높습니다.",
    impactHelpStronghold: "내 팬덤이 소유한 영토에서만 나타나고, 지금 거점 단계에서 어떤 혜택이 적용됐는지 알려줘요.",
    impactHelpTerritory: "이번 원정 포인트를 더했을 때의 결과예요. 소유자를 넘어서면 점령 예상, 이미 내 영토면 방어 유지, 아직 못 넘었으면 탈환 진행입니다. 화살표 왼쪽은 지금 이 영토의 거점 단계, 오른쪽은 원정을 마쳤을 때 내 포인트로 예상되는 단계입니다.",
    impactHelpRank: "전국 팬덤 랭킹의 예상 변화예요. 순위는 거점 수를 먼저 보고, 같으면 유효 포인트로 갈립니다. 점령이 예상되면 거점 수 변화까지 반영해 계산합니다.",
    multiplier: "지역균형 보너스",
    territoryImpact: "영토 영향",
    rankImpact: "팬덤 순위 영향",
    hold: "방어 유지",
    advance: "탈환 진행",
    captureExpected: "점령 예상",
    rankHold: "현재 순위 유지",
    start: "원정 시작",
    inProgress: "원정 중",
    finished: "원정 완료",
    blocked: "다른 원정 진행 중",
    blockedNote: "진행 중인 원정을 종료해야 다른 지역 원정을 시작할 수 있어요.",
    previousTerritory: "이전 영토",
    nextTerritory: "다음 영토",
    pagerLabel: "영토 넘기기",
    changeArtist: "아티스트 변경",
  },
  en: {
    owner: "Current owner",
    challenger: "Challenger",
    regionalStory: "Regional connection story",
    regionalSupport: "Public tourism route in this region",
    noDirectPlace: "No verified direct artist destination is available, so this route includes public attractions only.",
    stronghold: "Stronghold stage",
    seed: "Seed",
    tree: "Tree",
    landmark: "Landmark",
    defense: "Defense lead",
    capture: "Points to capture",
    build: "Points to grow",
    maxStage: "Defending the highest stage",
    sourceConnection: "Connection evidence source",
    sourceTerritory: "Territory data source",
    evidenceDisclosure: "Why this is recommended",
    evidenceSource: "View source",
    awardTitle: "Estimated recommended-expedition points",
    awardHelp: "How these points are calculated",
    awardHelpVisit: "Each place carries a fixed base value, awarded once the check-in is approved.",
    awardHelpDwell: `Stay ${GAME_RULES.dwellLongMinutes} minutes or longer for ${GAME_RULES.dwell60Minutes}P, or ${GAME_RULES.dwellShortMinutes} minutes for ${GAME_RULES.dwell30Minutes}P.`,
    awardHelpLocalSpend: `Verify spending at a local business for ${GAME_RULES.localSpend}P.`,
    awardHelpAccommodation: `Verify an overnight stay for ${GAME_RULES.accommodation}P.`,
    awardHelpStronghold: `Only in territories your fandom owns. Seed adds +${GAME_RULES.strongholdVisitBonus}P, tree adds +${GAME_RULES.strongholdDwellBonus}P once a dwell bonus applies, and landmark adds +${GAME_RULES.strongholdSpendBonus}P with verified spending.`,
    awardHelpTotalTerm: "After the subtotal",
    awardHelpTotal: `The regional multiplier applies, repeat visits to the same place decay ${GAME_RULES.repeatDecay.join("× → ")}×, and the daily cap is ${GAME_RULES.dailyCap.toLocaleString()}P.`,
    impactTitle: "Recommended expedition impact",
    impactHelp: "What these impact figures mean",
    impactHelpBalance: "The regional multiplier applied to the subtotal. The note beside it is the reason for that multiplier; regions worth steering visits toward carry a higher one.",
    impactHelpStronghold: "Appears only in territories your fandom owns, and names the benefit your current stronghold stage grants.",
    impactHelpTerritory: "The outcome once these points land. Passing the owner reads as capture expected, an owned territory reads as defense held, and falling short reads as capture progress. The arrow runs from this territory's current stronghold stage to the stage your own points would reach.",
    impactHelpRank: "The projected move in the national fandom ranking. Rank goes by stronghold count first and valid points as the tiebreak, and a projected capture is folded into the stronghold count.",
    multiplier: "Regional-balance multiplier",
    territoryImpact: "Territory impact",
    rankImpact: "Fandom-rank impact",
    hold: "Defense held",
    advance: "Capture progress",
    captureExpected: "Capture expected",
    rankHold: "Current rank held",
    start: "Start expedition",
    inProgress: "Expedition in progress",
    finished: "Expedition complete",
    blocked: "Another expedition in progress",
    blockedNote: "End the running expedition before starting one in another territory.",
    previousTerritory: "Previous territory",
    nextTerritory: "Next territory",
    pagerLabel: "Territory pager",
    changeArtist: "Change artist",
  },
} as const;

function orderedStandings(territory: PreviewTerritory) {
  return [...territory.standings].sort((a, b) => b.validPoints - a.validPoints);
}

function nextStageGap(points: number) {
  if (points < GAME_RULES.strongholdTreeAt) return GAME_RULES.strongholdTreeAt - points;
  if (points < GAME_RULES.strongholdLandmarkAt) return GAME_RULES.strongholdLandmarkAt - points;
  return null;
}

function estimateAward(expedition: PreviewExpedition, territory: PreviewTerritory, session: DemoSession, artistId: ArtistProfile["id"]) {
  const firstStop = previewContent.places.find((place) => place.id === expedition.stopIds[0]);
  return calculateMissionAward({
    visitBase: firstStop?.visitBase ?? 0,
    dwellMinutes: firstStop?.dwellMinutes ?? 0,
    localSpendVerified: true,
    accommodationVerified: true,
    balanceMultiplier: territory.balanceMultiplier,
    fandomSizeMultiplier: 1,
    repeatCount: firstStop ? (session.missionVisitCounts[firstStop.id] ?? 0) : 0,
    contributedToday: session.contributedToday,
    ownerStrongholdStage: territory.ownerArtistId === artistId ? territory.strongholdStage : null,
  });
}

function projectRank(session: DemoSession, artist: ArtistProfile, territory: PreviewTerritory, points: number) {
  const currentRank = rankFandoms(session.fandoms).find((row) => row.artistId === artist.id)?.rank ?? 0;
  const owner = territory.standings.find((standing) => standing.artistId === territory.ownerArtistId);
  const selected = territory.standings.find((standing) => standing.artistId === artist.id);
  const captures = artist.id !== territory.ownerArtistId && (selected?.validPoints ?? 0) + points > (owner?.validPoints ?? 0);
  const projected = session.fandoms.map((row) => {
    const strongholdDelta = row.artistId === artist.id && captures
      ? 1
      : row.artistId === territory.ownerArtistId && captures
        ? -1
        : 0;
    return {
      ...row,
      strongholds: row.strongholds + strongholdDelta,
      validPoints: row.validPoints + (row.artistId === artist.id ? points : 0),
    };
  });
  const projectedRank = rankFandoms(projected).find((row) => row.artistId === artist.id)?.rank ?? currentRank;
  return { currentRank, projectedRank, captures };
}

export function TacticalPanel({
  session,
  artist,
  territory,
  connection,
  expedition,
  expeditionTerritory,
  pageIndex,
  pageCount,
  onPage,
}: {
  session: DemoSession;
  artist: ArtistProfile;
  territory: PreviewTerritory;
  connection: ArtistConnection | null;
  expedition: PreviewExpedition;
  expeditionTerritory: PreviewTerritory;
  pageIndex: number;
  pageCount: number;
  onPage(index: number): void;
  onStartExpedition(): void;
}) {
  const demoSession = useDemoSession();
  const swipeOrigin = useRef<{ x: number; y: number } | null>(null);
  const [awardHelpOpen, setAwardHelpOpen] = useState(false);
  const [impactHelpOpen, setImpactHelpOpen] = useState(false);
  const locale: Locale = session.locale;
  const copy = panelCopy[locale];
  const standings = orderedStandings(territory);
  const owner = standings.find((standing) => standing.artistId === territory.ownerArtistId) ?? standings[0];
  const challenger = standings.find((standing) => standing.artistId !== territory.ownerArtistId) ?? standings[1];
  const selected = standings.find((standing) => standing.artistId === artist.id);
  const selectedPoints = selected?.validPoints ?? 0;
  const ownerPoints = owner?.validPoints ?? 0;
  const defenseGap = Math.max(ownerPoints - (challenger?.validPoints ?? 0), 0);
  const captureGap = Math.max(ownerPoints - selectedPoints + 1, 1);
  const buildGap = nextStageGap(selectedPoints);
  const award = estimateAward(expedition, expeditionTerritory, session, artist.id);
  const expeditionStanding = expeditionTerritory.standings.find((standing) => standing.artistId === artist.id);
  const expeditionPoints = expeditionStanding?.validPoints ?? 0;
  const projectedPoints = expeditionPoints + award.cappedPoints;
  const rank = projectRank(session, artist, expeditionTerritory, award.cappedPoints);
  const predictedStage = stageForPoints(projectedPoints);
  const selectedOwns = territory.ownerArtistId === artist.id;
  const expeditionStageCopy = copy[expeditionTerritory.strongholdStage];
  const expeditionSelectedOwns = expeditionTerritory.ownerArtistId === artist.id;
  const sourceUrl = connection?.sourceUrls[0] ?? territory.sourceUrls[0];
  const blockedByOtherRoute = session.activeExpeditionId !== null && session.activeExpeditionId !== expedition.id;
  const actionLabel = session.completedExpeditionIds.includes(expedition.id)
    ? copy.finished
    : session.activeExpeditionId === expedition.id
      ? copy.inProgress
      : blockedByOtherRoute
        ? copy.blocked
        : copy.start;
  const territoryOwnerColor = previewContent.artists.find((candidate) => candidate.id === territory.ownerArtistId)?.color;
  const noConnectionRecommendation = expedition.artistId === null
    ? (locale === "ko"
        ? "이 영토에는 선택한 아티스트의 검증된 직접 연결이 없어 공공 관광 원정을 추천합니다."
        : "This territory has no verified direct connection to the selected artist, so a public tourism expedition is recommended.")
    : (locale === "ko"
        ? `이 영토에는 선택한 아티스트의 검증된 직접 연결이 없어 ${expeditionTerritory.name.ko}의 검증된 아티스트 연관 장소 중심 원정을 추천합니다.`
        : `This territory has no verified direct connection to the selected artist, so the nearest verified artist-linked expedition in ${expeditionTerritory.name.en} is recommended.`);

  // Terms mirror the labels rendered beside them, so the help cannot drift.
  const awardHelpLines: readonly (readonly [string, string])[] = [
    [t(locale, "rewardVisit"), copy.awardHelpVisit],
    [t(locale, "rewardDwell"), copy.awardHelpDwell],
    [t(locale, "rewardLocalSpend"), copy.awardHelpLocalSpend],
    [t(locale, "rewardAccommodation"), copy.awardHelpAccommodation],
    [t(locale, "rewardStrongholdBonus"), copy.awardHelpStronghold],
    [copy.awardHelpTotalTerm, copy.awardHelpTotal],
  ];
  const impactHelpLines: readonly (readonly [string, string])[] = [
    [copy.multiplier, copy.impactHelpBalance],
    [t(locale, "rewardStrongholdBonus"), copy.impactHelpStronghold],
    [copy.territoryImpact, copy.impactHelpTerritory],
    [copy.rankImpact, copy.impactHelpRank],
  ];

  const page = (next: number) => {
    if (next >= 0 && next < pageCount) onPage(next);
  };

  const beginSwipe = (event: TouchEvent<HTMLElement>) => {
    const touch = event.touches[0];
    swipeOrigin.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  };

  // Only a decisive horizontal flick pages, so vertical scrolling still works.
  const endSwipe = (event: TouchEvent<HTMLElement>) => {
    const origin = swipeOrigin.current;
    const touch = event.changedTouches[0];
    swipeOrigin.current = null;
    if (!origin || !touch || pageCount <= 1) return;
    const horizontal = touch.clientX - origin.x;
    const vertical = touch.clientY - origin.y;
    if (Math.abs(horizontal) < 56 || Math.abs(horizontal) < Math.abs(vertical) * 1.5) return;
    page(horizontal < 0 ? pageIndex + 1 : pageIndex - 1);
  };

  const standingName = (standing: TerritoryStanding | undefined) => {
    if (!standing) return "—";
    const profile = previewContent.artists.find((candidate) => candidate.id === standing.artistId);
    return `${profile?.artistName[locale] ?? standing.artistId} · ${standing.fandomName} ${standing.validPoints}P`;
  };

  return (
    <aside
      className="tactical-panel"
      aria-label={`${territory.name[locale]} ${locale === "ko" ? "전술 패널" : "tactical panel"}`}
      onTouchStart={pageCount > 1 ? beginSwipe : undefined}
      onTouchEnd={pageCount > 1 ? endSwipe : undefined}
    >
      {pageCount > 1 ? (
        <nav className="tactical-pager" aria-label={copy.pagerLabel}>
          <button type="button" aria-label={copy.previousTerritory} disabled={pageIndex <= 0} onClick={() => page(pageIndex - 1)}>
            <ArrowLeft size={18} strokeWidth={2.4} aria-hidden="true" />
          </button>
          <div className="tactical-pager-status">
            {pageCount <= 12 ? (
              <ul className="tactical-pager-dots">
                {Array.from({ length: pageCount }, (_, position) => (
                  <li key={position}>
                    <button
                      type="button"
                      aria-label={locale === "ko"
                        ? `${pageCount}개 중 ${position + 1}번째 영토 보기`
                        : `Show territory ${position + 1} of ${pageCount}`}
                      aria-current={position === pageIndex ? "true" : undefined}
                      onClick={() => page(position)}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="tactical-pager-count" role="status">
                <b>{pageIndex + 1}</b> / {pageCount}
              </p>
            )}
          </div>
          <button type="button" aria-label={copy.nextTerritory} disabled={pageIndex >= pageCount - 1} onClick={() => page(pageIndex + 1)}>
            <ArrowRight size={18} strokeWidth={2.4} aria-hidden="true" />
          </button>
        </nav>
      ) : null}
      <header>
        <span>{artist.artistName[locale]} · {artist.fandomName}</span>
        <h2>{territory.name[locale]}</h2>
      </header>

      <dl className="tactical-standings">
        <div><dt>{copy.owner} · {owner?.fandomName ?? "—"}</dt><dd>{standingName(owner)}</dd></div>
        <div><dt>{copy.challenger} · {challenger?.fandomName ?? "—"}</dt><dd>{standingName(challenger)}</dd></div>
        <div><dt>{copy.stronghold}</dt><dd><StrongholdMark stage={territory.strongholdStage} locale={locale} ownerColor={territoryOwnerColor} /></dd></div>
        <div>
          <dt>{selectedOwns ? copy.defense : copy.capture}</dt>
          <dd>
            {selectedOwns ? `${copy.defense} ${defenseGap}P` : `${copy.capture} ${captureGap}P`}
            {selectedOwns ? ` · ${buildGap === null ? copy.maxStage : `${copy.build} ${buildGap}P`}` : null}
          </dd>
        </div>
      </dl>

      <section className="tactical-connection">
        {connection ? (
          <>
            <strong>{copy.regionalStory} · {connection.memberName[locale]}</strong>
            <p>{connection.story[locale]}</p>
          </>
        ) : (
          <>
            <strong>{t(locale, "evidenceNearby")}</strong>
            <p>{noConnectionRecommendation}</p>
          </>
        )}
        <details className="tactical-evidence">
          <summary>{copy.evidenceDisclosure}</summary>
          <a href={sourceUrl} target="_blank" rel="noreferrer">{copy.evidenceSource}</a>
        </details>
        {expedition.artistId === null ? (
          <div>
            <strong>{copy.regionalSupport}</strong>
            <p>{copy.noDirectPlace}</p>
          </div>
        ) : null}
      </section>

      <section className="tactical-award" aria-label={copy.awardTitle}>
        <div className="tactical-section-heading">
          <h3>{copy.awardTitle}</h3>
          <button
            type="button"
            className="tactical-help-toggle"
            aria-expanded={awardHelpOpen}
            aria-controls="tactical-award-help"
            aria-label={copy.awardHelp}
            onClick={() => setAwardHelpOpen((open) => !open)}
          >
            <CircleAlert size={17} aria-hidden="true" />
          </button>
        </div>
        {awardHelpOpen ? (
          <ul className="tactical-help-note" id="tactical-award-help">
            {awardHelpLines.map(([term, detail]) => (
              <li key={term}><strong>{term}</strong>{detail}</li>
            ))}
          </ul>
        ) : null}
        <dl>
          <div><dt>{t(locale, "rewardVisit")}</dt><dd>{award.visit}P</dd></div>
          <div><dt>{t(locale, "rewardDwell")}</dt><dd>{award.dwell}P</dd></div>
          <div><dt>{t(locale, "rewardLocalSpend")}</dt><dd>{award.localSpend}P</dd></div>
          <div><dt>{t(locale, "rewardAccommodation")}</dt><dd>{award.accommodation}P</dd></div>
          {award.strongholdBonus > 0 ? <div><dt>{t(locale, "rewardStrongholdBonus")}</dt><dd>+{award.strongholdBonus}P</dd></div> : null}
        </dl>
      </section>

      <section
        className="tactical-impact"
        aria-label={`${expeditionTerritory.name[locale]} ${locale === "ko" ? "추천 원정 영향" : "recommended expedition impact"}`}
      >
        <div className="tactical-section-heading">
          <h3>{copy.impactTitle}</h3>
          <button
            type="button"
            className="tactical-help-toggle"
            aria-expanded={impactHelpOpen}
            aria-controls="tactical-impact-help"
            aria-label={copy.impactHelp}
            onClick={() => setImpactHelpOpen((open) => !open)}
          >
            <CircleAlert size={17} aria-hidden="true" />
          </button>
        </div>
        {impactHelpOpen ? (
          <ul className="tactical-help-note" id="tactical-impact-help">
            {impactHelpLines.map(([term, detail]) => (
              <li key={term}><strong>{term}</strong>{detail}</li>
            ))}
          </ul>
        ) : null}
        <p><strong>{copy.multiplier} {expeditionTerritory.balanceMultiplier}×</strong> · {expeditionTerritory.balanceReason[locale]}</p>
        {award.strongholdBonus > 0 ? <p><strong>{t(locale, "rewardStrongholdBonus")}</strong>: {t(locale, expeditionTerritory.strongholdStage === "seed" ? "strongholdSeedBuff" : expeditionTerritory.strongholdStage === "tree" ? "strongholdTreeBuff" : "strongholdLandmarkBuff")}</p> : null}
        <p><strong>{copy.territoryImpact}</strong>: {rank.captures ? copy.captureExpected : expeditionSelectedOwns ? copy.hold : copy.advance} · {expeditionStageCopy} → {copy[predictedStage]}</p>
        <p><strong>{copy.rankImpact}</strong>: #{rank.currentRank}{rank.currentRank === rank.projectedRank ? ` · ${copy.rankHold}` : ` → #${rank.projectedRank}`}</p>
      </section>

      <button className="primary-button" type="button" disabled={blockedByOtherRoute} onClick={() => demoSession.dispatch({
        type: "openRecommendedExpedition",
        expeditionId: expedition.id,
        territoryId: expedition.territoryId,
      })}>
        {actionLabel}
      </button>
      {blockedByOtherRoute ? <p className="tactical-blocked-note" role="note">{copy.blockedNote}</p> : null}
    </aside>
  );
}
