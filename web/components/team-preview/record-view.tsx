import { useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Camera, Check, CircleAlert, Lock, X } from "@/components/ui/icons";
import { useBodyScrollLock } from "@/components/ui/use-body-scroll-lock";
import { useModalFocus } from "@/components/ui/use-modal-focus";
import { StageBadge } from "@/components/team-preview/stage-badge";
import { StrongholdMark } from "@/components/team-preview/stronghold-mark";
import { previewContent } from "@/features/team-preview/content";
import type { DemoSession } from "@/features/team-preview/demo-session";
import { useDisclosure, useDisclosures } from "@/features/team-preview/demo-session-context";
import { t } from "@/features/team-preview/i18n";
import type { Locale, StrongholdStage } from "@/features/team-preview/types";

// A fixed anchor so the demo timeline reads as real dates without inventing
// data: every approved check-in lands one day after the previous one.
const DEMO_TIMELINE_START = Date.UTC(2026, 7, 24);

function demoCheckInDate(index: number) {
  return new Date(DEMO_TIMELINE_START + index * 86_400_000);
}

function formatDemoDate(index: number, locale: Locale) {
  return demoCheckInDate(index).toLocaleDateString(locale === "ko" ? "ko-KR" : "en-US", {
    month: "2-digit",
    day: "2-digit",
    timeZone: "UTC",
  });
}

const stageOrder: Record<StrongholdStage, number> = { seed: 0, tree: 1, landmark: 2 };
const stages: StrongholdStage[] = ["seed", "tree", "landmark"];

const stageCopy = {
  ko: { seed: "씨앗", tree: "나무", landmark: "랜드마크" },
  en: { seed: "Seed", tree: "Tree", landmark: "Landmark" },
} as const;

const rewards: { stage: StrongholdStage; label: "recordSeedBadge" | "recordTreeBadge" | "recordLandmarkBadge" }[] = [
  { stage: "seed", label: "recordSeedBadge" },
  { stage: "tree", label: "recordTreeBadge" },
  { stage: "landmark", label: "recordLandmarkBadge" },
];

export function contributionRank(points: number) {
  return Math.max(1, 128 - Math.floor(points / 50));
}

function recordSummary(session: DemoSession) {
  const approvedCheckIns = session.approvedCheckIns.map((entry, index) => ({ entry, index }));
  const points = approvedCheckIns.reduce((total, { entry }) => total + entry.awardedPoints, 0);
  const highestStageOrder = approvedCheckIns.reduce(
    (highest, { entry }) => Math.max(highest, stageOrder[entry.strongholdStage]),
    -1,
  );
  return {
    approvedCheckIns,
    points,
    influencedTerritories: new Set(approvedCheckIns.map(({ entry }) => entry.territoryId)).size,
    highestStageOrder,
    timeline: [...approvedCheckIns].sort((left, right) => right.index - left.index),
  };
}

export function RecordView({
  locale,
  session,
  onExploreTerritories = () => undefined,
  onChangeArtist = () => undefined,
  onSignOut,
  onReset,
  onReplayGuide,
}: {
  locale: Locale;
  session: DemoSession;
  onExploreTerritories?: () => void;
  onChangeArtist?: () => void;
  onSignOut?: () => void;
  onReset?: () => void;
  onReplayGuide?: () => void;
}) {
  const [disclosures, setDisclosure] = useDisclosures();
  const [seasonInfoOpen, setSeasonInfoOpen] = useDisclosure("record.season", false);
  const [growthInfoOpen, setGrowthInfoOpen] = useDisclosure("record.growth", false);
  const [openCheckIn, setOpenCheckIn] = useState<{ index: number } | null>(null);
  // Each badge row keeps its own fold, so a reader who opened one to read its
  // sources finds it still open next time they pass through.
  const rewardKey = (stage: StrongholdStage) => `record.reward.${stage}`;
  const rewardOpen = (stage: StrongholdStage) => disclosures[rewardKey(stage)] ?? false;
  const toggleReward = (stage: StrongholdStage) => setDisclosure(rewardKey(stage), !rewardOpen(stage));
  const detailRef = useRef<HTMLDivElement>(null);
  const detailTitleRef = useRef<HTMLHeadingElement>(null);
  const summary = recordSummary(session);
  useModalFocus(openCheckIn !== null, detailRef, detailTitleRef, () => setOpenCheckIn(null));
  useBodyScrollLock(openCheckIn !== null);
  const artist = previewContent.artists.find((candidate) => candidate.id === session.selectedArtistId);
  const highestStage = summary.highestStageOrder >= 0 ? stages[summary.highestStageOrder] : null;
  const formatPoints = (points: number) => `${points.toLocaleString(locale === "ko" ? "ko-KR" : "en-US")}P`;
  // Which fandom a visit was made for. With more than one followed, "where I
  // went" is only half the record — the other half is who I went as.
  const fandomTag = (artistId: string | undefined) => previewContent.artists
    .find((candidate) => candidate.id === artistId)?.fandomName;
  // A badge belongs to the fandom, not to the member who happened to earn it:
  // a stage the fandom holds anywhere is a stage every member wears. The
  // "highest stage" tile above stays personal — that one is a record.
  // Where each badge came from: every territory, across every fandom on the
  // roster, standing at that stage or above. A reader who follows three
  // fandoms earned it three times over, and the record says so rather than
  // crediting whichever one happens to be active.
  const earnedAt = (stage: StrongholdStage) => session.territories
    .filter((territory) => (
      session.followedArtistIds.includes(territory.ownerArtistId)
      && stageOrder[territory.strongholdStage] >= stageOrder[stage]
    ))
    .map((territory) => ({
      key: `${territory.ownerArtistId}-${territory.id}`,
      fandomName: previewContent.artists.find((candidate) => candidate.id === territory.ownerArtistId)?.fandomName
        ?? territory.ownerArtistId,
      color: previewContent.artists.find((candidate) => candidate.id === territory.ownerArtistId)?.color,
      territoryName: territory.name[locale],
    }));
  const followedArtists = session.followedArtistIds
    .map((artistId) => previewContent.artists.find((candidate) => candidate.id === artistId))
    .filter((candidate): candidate is (typeof previewContent.artists)[number] => candidate !== undefined);

  // Each expedition spans its first through its last approved check-in.
  const expeditionSpans = new Map<string, { first: number; last: number }>();
  for (const { entry, index } of summary.approvedCheckIns) {
    const span = expeditionSpans.get(entry.expeditionId);
    expeditionSpans.set(entry.expeditionId, span
      ? { first: Math.min(span.first, index), last: Math.max(span.last, index) }
      : { first: index, last: index });
  }
  const spanLabel = (expeditionId: string) => {
    const span = expeditionSpans.get(expeditionId);
    if (!span) return null;
    const first = formatDemoDate(span.first, locale);
    const last = formatDemoDate(span.last, locale);
    return first === last ? first : `${first} ~ ${last}`;
  };
  const detail = openCheckIn
    ? summary.approvedCheckIns.find(({ index }) => index === openCheckIn.index) ?? null
    : null;
  const detailPlace = detail
    ? previewContent.places.find((candidate) => candidate.id === detail.entry.placeId) ?? null
    : null;

  return (
    <div className="view record-view">
      <h1>{t(locale, "navRecord")}</h1>

      <section className="record-season-summary" aria-label={t(locale, "recordSeasonSummary")}>
        <div className={seasonInfoOpen ? "record-season-chip open" : "record-season-chip"}>
          <button
            type="button"
            aria-expanded={seasonInfoOpen}
            aria-controls="record-season-about"
            aria-label={t(locale, "seasonInfo")}
            onClick={() => setSeasonInfoOpen((open) => !open)}
          >
            <span>{t(locale, "seasonName")}</span>
            <strong>{t(locale, "seasonRemaining")}</strong>
            <CircleAlert size={14} aria-hidden="true" />
          </button>
          {seasonInfoOpen ? <p id="record-season-about">{t(locale, "seasonAbout")}</p> : null}
        </div>
        <div className="record-season-hero">
          <span>{t(locale, "recordSeasonSummary")}</span>
          <small>{t(locale, "recordContributionPoints")}</small>
          <strong>{formatPoints(summary.points)}</strong>
          <p>{t(locale, "recordContributionRank")} <b>#{contributionRank(summary.points)}</b></p>
        </div>
        <dl className="record-summary" aria-label={t(locale, "recordSeasonSummary")}>
          <div>
            <dt>{t(locale, "recordCompleted")}</dt>
            <dd>{session.completedExpeditionIds.length}</dd>
          </div>
          <div><dt>{t(locale, "recordCheckIns")}</dt><dd>{summary.approvedCheckIns.length}</dd></div>
          <div><dt>{t(locale, "recordTerritories")}</dt><dd>{summary.influencedTerritories}</dd></div>
          <div><dt>{t(locale, "recordHighestStage")}</dt><dd>{highestStage ? `${stageCopy[locale][highestStage]} ${t(locale, "recordStronghold")}` : "—"}</dd></div>
        </dl>
      </section>

      <section className="record-completed" aria-label={t(locale, "recordCompletedList")}>
          <h2>{t(locale, "recordCompletedList")}</h2>
          {session.completedExpeditionIds.length === 0 ? (
            <p>{t(locale, "recordCompletedEmpty")}</p>
          ) : (
            <ol aria-label={t(locale, "recordCompletedList")}>
              {session.completedExpeditionIds.map((expeditionId) => {
                const expedition = previewContent.expeditions.find((candidate) => candidate.id === expeditionId);
                const territory = session.territories.find((candidate) => candidate.id === expedition?.territoryId);
                // A record can outlive the fandom that made it, so the row
                // names the fandom that was playing, not the one playing now.
                const walkedBy = fandomTag(session.approvedCheckIns.find((record) => record.expeditionId === expeditionId)?.artistId);
                return (
                  <li key={expeditionId}>
                    <strong>{expedition?.title[locale] ?? expeditionId}</strong>
                    <span>{territory?.name[locale] ?? expedition?.territoryId ?? "—"}</span>
                    <span>{spanLabel(expeditionId) ?? "—"}</span>
                    {walkedBy ? <em className="record-fandom-tag">{walkedBy}</em> : null}
                  </li>
                );
              })}
            </ol>
          )}
      </section>

      {summary.approvedCheckIns.length === 0 ? (
        <section className="record-empty">
          <h2>{t(locale, "recordEmptyTitle")}</h2>
          <p>{t(locale, "recordEmptyDescription")}</p>
          <button type="button" onClick={onExploreTerritories}>{t(locale, "recordExploreTerritories")}</button>
        </section>
      ) : null}

      <section className="record-growth">
        <div className="record-section-heading">
          <h2>{t(locale, "recordGrowth")}</h2>
          <button
            type="button"
            className="tactical-help-toggle"
            aria-expanded={growthInfoOpen}
            aria-controls="record-growth-about"
            aria-label={t(locale, "growthInfo")}
            onClick={() => setGrowthInfoOpen((open) => !open)}
          >
            <CircleAlert size={17} aria-hidden="true" />
          </button>
        </div>
        {growthInfoOpen ? <p className="record-growth-about" id="record-growth-about">{t(locale, "growthAbout")}</p> : null}
        <ol aria-label={t(locale, "recordGrowth")}>
          {stages.map((stage) => {
            const unlocked = earnedAt(stage).length > 0;
            return (
              <li key={stage} className={unlocked ? "unlocked" : "locked"}>
                <StrongholdMark stage={stage} locale={locale} ownerColor={artist?.color} />
                <span>{t(locale, stage === "seed" ? "strongholdSeedBuff" : stage === "tree" ? "strongholdTreeBuff" : "strongholdLandmarkBuff")}</span>
                <small className={unlocked ? "record-state unlocked" : "record-state"}>
                  {unlocked ? <Check size={14} strokeWidth={3} aria-hidden="true" /> : <Lock size={13} strokeWidth={2.6} aria-hidden="true" />}
                  <span className="sr-only">{t(locale, unlocked ? "recordUnlocked" : "recordLocked")}</span>
                </small>
              </li>
            );
          })}
        </ol>
      </section>

      {summary.approvedCheckIns.length > 0 ? (
        <section className="record-history">
          <h2>{t(locale, "recordTimeline")}</h2>
          <ol aria-label={t(locale, "recordTimeline")}>
            {summary.timeline.map(({ entry, index }) => {
              const place = previewContent.places.find((candidate) => candidate.id === entry.placeId);
              const territory = session.territories.find((candidate) => candidate.id === entry.territoryId);
              return (
                <li key={`${entry.expeditionId}-${entry.placeId}-${index}`}>
                  <strong>
                    <button type="button" onClick={() => setOpenCheckIn({ index })}>
                      {place?.name[locale] ?? entry.placeId}
                    </button>
                  </strong>
                  {fandomTag(entry.artistId) ? <em className="record-fandom-tag">{fandomTag(entry.artistId)}</em> : null}
                  <div className="record-history-meta">
                    <span>{territory?.name[locale] ?? entry.territoryId}</span>
                    <span>{formatPoints(entry.awardedPoints)}</span>
                    <span>{stageCopy[locale][entry.strongholdStage]} {t(locale, "recordStronghold")}</span>
                    <span className="record-history-date">{spanLabel(entry.expeditionId) ?? formatDemoDate(index, locale)}</span>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}

      <section className="record-rewards">
        <h2>{t(locale, "recordRewards")}</h2>
        <ul aria-label={t(locale, "recordRewards")}>
          {rewards.map(({ stage, label }) => {
            const sources = earnedAt(stage);
            const unlocked = sources.length > 0;
            return (
              <li key={stage} className={unlocked ? "unlocked" : "locked"}>
                {/* Where a badge came from is detail, so the row keeps it
                    folded and opens on a press. No caret: the row is the
                    control, and a badge not yet earned has nothing to open. */}
                {unlocked ? (
                  <button
                    type="button"
                    className="record-reward-open"
                    aria-expanded={rewardOpen(stage)}
                    onClick={() => toggleReward(stage)}
                  >
                    <StageBadge stage={stage} locale={locale} unlocked ownerColor={artist?.color} />
                    <span>{t(locale, label)}</span>
                  </button>
                ) : (
                  <span className="record-reward-open">
                    <StageBadge stage={stage} locale={locale} unlocked={false} ownerColor={artist?.color} />
                    <span>{t(locale, label)}</span>
                  </span>
                )}
                <span className={unlocked ? "record-state unlocked" : "record-state"}>
                  {unlocked ? <Check size={14} strokeWidth={3} aria-hidden="true" /> : <Lock size={13} strokeWidth={2.6} aria-hidden="true" />}
                  <span className="sr-only">{t(locale, unlocked ? "recordUnlocked" : "recordLocked")}</span>
                </span>
                {/* Each fandom and place that earned it, one tag apiece. */}
                {rewardOpen(stage) ? (
                  <span className="record-reward-sources">
                    {sources.map((source) => (
                      <small
                        key={source.key}
                        style={source.color ? { "--artist-color": source.color } as CSSProperties : undefined}
                      >
                        {source.fandomName} {source.territoryName}
                      </small>
                    ))}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
        <button type="button" disabled>{t(locale, "recordCharacterFuture")}</button>
      </section>

      {detail && typeof document !== "undefined" ? createPortal(
        <div className="reset-dialog-overlay">
          <div className="reset-dialog record-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="record-detail-title" ref={detailRef}>
            <button
              type="button"
              className="record-detail-close"
              aria-label={t(locale, "recordCheckInClose")}
              onClick={() => setOpenCheckIn(null)}
            >
              <X size={16} strokeWidth={2.6} aria-hidden="true" />
            </button>
            <h2 id="record-detail-title" tabIndex={-1} ref={detailTitleRef}>
              {detailPlace?.name[locale] ?? detail.entry.placeId}
            </h2>
            <p>{t(locale, "recordCheckInDetail")}</p>
            <div className="record-detail-photo" role="img" aria-label={t(locale, "recordCheckInPhoto")}>
              <Camera size={26} aria-hidden="true" />
              <small>{t(locale, "recordCheckInPhoto")}</small>
            </div>
            <dl className="record-detail-facts">
              <div><dt>{t(locale, "recordCheckInDate")}</dt><dd>{formatDemoDate(detail.index, locale)}</dd></div>
              <div><dt>{t(locale, "recordCheckInAwarded")}</dt><dd>{formatPoints(detail.entry.awardedPoints)}</dd></div>
              <div><dt>{t(locale, "recordCheckInStage")}</dt><dd>{stageCopy[locale][detail.entry.strongholdStage]} {t(locale, "recordStronghold")}</dd></div>
              <div><dt>{t(locale, "recordExpeditionPeriod")}</dt><dd>{spanLabel(detail.entry.expeditionId) ?? "—"}</dd></div>
            </dl>
          </div>
        </div>,
        document.body,
      ) : null}

      <section className="record-fandom-settings" aria-label={t(locale, "recordFandomSettings")}>
        <div>
          <span>{t(locale, "recordFandomSettings")}</span>
          <strong>{artist ? `${artist.artistName[locale]} · ${artist.fandomName}` : "—"}</strong>
          <p>{t(locale, "recordFandomSettingsDescription")}</p>
          {/* The roster is read here and managed in the drawer, so this page
              says who is on it without becoming a second place to edit it. */}
          {followedArtists.length > 1 ? (
            <ul className="record-fandom-roster" aria-label={t(locale, "recordFollowedFandoms")}>
              {followedArtists.map((followed) => (
                <li
                  key={followed.id}
                  className={followed.id === session.selectedArtistId ? "active" : undefined}
                  style={{ "--artist-color": followed.color } as CSSProperties}
                >
                  {followed.fandomName}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <button type="button" onClick={onChangeArtist}>{t(locale, "recordArtistSettings")}</button>
      </section>

      {onSignOut || onReset || onReplayGuide ? (
        <section className="record-account" aria-label={t(locale, "recordAccount")}>
          <span>{t(locale, "recordAccount")}</span>
          {onSignOut ? (
            <div className="record-account-row">
              <div>
                <strong>{t(locale, "recordSignOut")}</strong>
                <p>{t(locale, "recordSignOutDescription")}</p>
              </div>
              <button type="button" onClick={onSignOut}>{t(locale, "recordSignOut")}</button>
            </div>
          ) : null}
          {onReplayGuide ? (
            <div className="record-account-row">
              <div>
                <strong>{t(locale, "tutorialReplay")}</strong>
                <p>{t(locale, "tutorialReplayDescription")}</p>
              </div>
              <button type="button" onClick={onReplayGuide}>{t(locale, "tutorialReplayAction")}</button>
            </div>
          ) : null}
          {onReset ? (
            <div className="record-account-row">
              <div>
                <strong>{t(locale, "resetDemo")}</strong>
                <p>{t(locale, "resetConfirmBody")}</p>
              </div>
              <button type="button" onClick={onReset}>{t(locale, "resetDemo")}</button>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
