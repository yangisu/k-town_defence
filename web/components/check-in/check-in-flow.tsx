"use client";

import { type ChangeEvent, useEffect, useReducer, useRef, useState } from "react";
import type { CheckInImpact, CheckInResult, CheckInService, Place } from "@/lib/domain";
import { BrowserEvidenceError, collectGpsSamples } from "@/lib/browser-evidence";
import { calculateMissionAward, type MissionAward, type MissionAwardInput } from "@/features/team-preview/game-rules";
import type { Locale } from "@/features/team-preview/types";
import { Camera, Check, LocateFixed, Shield, X } from "@/components/ui/icons";
import { checkInReducer, createInitialCheckInState, deriveCheckInProgress } from "./check-in-reducer";
import { StateMessage } from "@/components/ui/state-message";
import { useModalFocus } from "@/components/ui/use-modal-focus";

export type DemoAwardInput = Omit<MissionAwardInput, "dwellMinutes" | "localSpendVerified" | "accommodationVerified">;

type Props = {
  place: Place;
  service: CheckInService;
  mode?: "demo" | "integrated";
  geolocation?: Geolocation;
  locale?: Locale;
  demoAwardInput?: DemoAwardInput;
  impact?: CheckInImpact | null;
  onApproved?: (result: CheckInResult, award: MissionAward) => void;
  onClose: () => void;
};

const gpsKinds = ["start", "middle", "end"] as const;
const demoCopy = {
  ko: {
    pill: "데모 체크인", title: "현장 체크인", close: "체크인 닫기", approved: "체크인 승인 완료",
    visitApproved: "방문이 승인됐어요.", visit: "방문 기본", dwellBonus: "체류 보너스", localSpend: "로컬 소비",
    accommodation: "숙박", validPoints: "유효 포인트", territoryShare: "지역 점유율", stronghold: "거점",
    fandomRank: "팬덤 순위", personalRank: "내 기여 순위", continue: "여행 계속하기",
    intro: "데모 인증을 진행해 주세요.", gpsTitle: "현재 위치 3회", gpsDone: "GPS 위치 확인 완료",
    photoTitle: "현장 사진", photoPrompt: "원본 사진을 비공개 검토용으로 업로드", photoDone: "현장 사진 확인 완료", dwellTitle: "체류 시간", dwellDone: "체류 45분 확인",
    pending: "대기", extra: "추가 지역 기여", includeSpend: "로컬 소비 인증 포함", includeStay: "숙박 인증 포함",
    saveFailed: "체크인 저장에 실패했어요", saveFailedBody: "네트워크 연결을 확인하고 다시 시도해 주세요.",
    runDemo: "데모 인증 진행", review: "포인트 검토", submit: "체크인 제출", retry: "다시 제출",
    privacy: "이 화면은 실제 위치나 사진을 전송하지 않는 데모입니다.", impactSummary: "미션 영향 요약",
  },
  en: {
    pill: "Demo check-in", title: "On-site check-in", close: "Close check-in", approved: "Check-in approved",
    visitApproved: "visit approved.", visit: "Visit base", dwellBonus: "Dwell bonus", localSpend: "Local spend",
    accommodation: "Accommodation", validPoints: "Valid points", territoryShare: "Territory share", stronghold: "Stronghold",
    fandomRank: "Fandom rank", personalRank: "My contribution rank", continue: "Continue trip",
    intro: "Run demo verification to simulate the evidence sequence.", gpsTitle: "Three GPS positions", gpsDone: "GPS position verified",
    photoTitle: "On-site photo", photoPrompt: "Upload the original photo for private review", photoDone: "On-site photo verified", dwellTitle: "Dwell time", dwellDone: "Dwell 45 minutes verified",
    pending: "Pending", extra: "Additional local contribution", includeSpend: "Include local spend verification", includeStay: "Include accommodation verification",
    saveFailed: "Could not save the check-in", saveFailedBody: "Check your network connection and try again.",
    runDemo: "Run demo verification", review: "Review points", submit: "Submit check-in", retry: "Submit again",
    privacy: "This demo does not transmit a real location or photo.", impactSummary: "Mission impact summary",
  },
} as const;

export function CheckInFlow({
  place,
  service,
  mode = "demo",
  geolocation,
  locale = "ko",
  demoAwardInput,
  impact,
  onApproved,
  onClose,
}: Props) {
  const [idempotencyKey] = useState(() => globalThis.crypto.randomUUID());
  const [state, dispatch] = useReducer(
    checkInReducer,
    createInitialCheckInState(`pending-${place.id}`, place.id, idempotencyKey, mode),
  );
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [award, setAward] = useState<MissionAward | null>(null);
  const [busy, setBusy] = useState(false);
  const [evidenceIssue, setEvidenceIssue] = useState<string | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const progress = deriveCheckInProgress(state);
  const demoLabels = demoCopy[locale];
  const demoEvidenceComplete = progress.gpsCount === 3
    && Boolean(state.photoAssetId)
    && state.demoEvidence.simulatedDwellMinutes > 0;

  useModalFocus(true, dialogRef, titleRef, onClose);

  useEffect(() => {
    let active = true;
    void service.create(place.id)
      .then((session) => { if (active) dispatch({ type: "sessionCreated", sessionId: session.id }); })
      .catch(() => { if (active) dispatch({ type: "issue", issue: "network_failed" }); });
    return () => { active = false; };
  }, [place.id, service]);

  const collectLocation = async () => {
    if (state.sessionId.startsWith("pending-") || busy) return;
    setBusy(true);
    setEvidenceIssue(null);
    try {
      const source = geolocation ?? (typeof navigator === "undefined" ? undefined : navigator.geolocation);
      const samples = await collectGpsSamples(source, 3);
      for (const [index, sample] of samples.entries()) {
        await service.recordGps(state.sessionId, sample);
        dispatch({ type: "gpsSample", kind: gpsKinds[index], accuracyMeters: sample.accuracyMeters });
      }
    } catch (error) {
      if (error instanceof BrowserEvidenceError) {
        setEvidenceIssue(error.code === "location_denied"
          ? "위치 권한이 거부됐습니다. 브라우저 설정에서 허용해 주세요."
          : "현재 위치를 확인하지 못했습니다. 다시 시도해 주세요.");
      } else {
        dispatch({ type: "issue", issue: "network_failed" });
      }
    } finally {
      setBusy(false);
    }
  };

  const uploadPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || state.sessionId.startsWith("pending-")) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024) {
      setEvidenceIssue("10MiB 이하 JPEG, PNG 또는 WebP 사진을 선택해 주세요.");
      return;
    }
    setBusy(true);
    setEvidenceIssue(null);
    try {
      await service.recordPhoto(state.sessionId, { file, capturedAt: new Date().toISOString() });
      dispatch({ type: "photoCaptured", assetId: file.name });
    } catch {
      dispatch({ type: "issue", issue: "network_failed" });
    } finally {
      setBusy(false);
    }
  };

  const runDemo = () => {
    dispatch({ type: "demoEvidenceCollected", dwellMinutes: 45 });
  };

  const submit = async () => {
    if (busy || state.sessionId.startsWith("pending-")) return;
    if (state.status === "submitting" && state.issue === "network_failed") {
      dispatch({ type: "networkRetry" });
    } else {
      dispatch({ type: "submit" });
    }
    setBusy(true);
    try {
      const next = await service.submit(state.sessionId, state.idempotencyKey);
      setResult(next);
      if (mode === "demo" && next.decision === "approved" && demoAwardInput && onApproved) {
        const nextAward = calculateMissionAward({
          ...demoAwardInput,
          dwellMinutes: state.demoEvidence.simulatedDwellMinutes,
          localSpendVerified: state.demoEvidence.localSpendVerified,
          accommodationVerified: state.demoEvidence.accommodationVerified,
        });
        setAward(nextAward);
        onApproved(next, nextAward);
      }
      dispatch({ type: "resolve", decision: next.decision });
    } catch {
      dispatch({ type: "issue", issue: "network_failed" });
    } finally {
      setBusy(false);
    }
  };

  const approvedDemo = mode === "demo" && result?.decision === "approved";

  return (
    <div className="checkin-overlay" role="dialog" aria-modal="true" aria-labelledby="checkin-title" ref={dialogRef}>
      <div className="checkin-dialog">
        <header className="checkin-top">
          <div>
            <span className="demo-pill">{mode === "integrated" ? "실제 체크인" : demoLabels.pill}</span>
            <h1 id="checkin-title" tabIndex={-1} ref={titleRef}>{mode === "integrated" ? "현장 체크인" : demoLabels.title}</h1>
          </div>
          <button className="icon-button" aria-label={mode === "integrated" ? "체크인 닫기" : demoLabels.close} onClick={onClose}><X /></button>
        </header>

        {result ? (
          <section className="checkin-result">
            <div className="result-icon"><Check size={40} /></div>
            <span className="eyebrow">{result.decision === "pending" ? "CHECK-IN PENDING" : "CHECK-IN APPROVED"}</span>
            <h2>{approvedDemo ? demoLabels.approved : result.message}</h2>
            {result.decision === "pending" ? (
              <p>{place.nameKo} 체크인이 DB에 저장됐습니다. 운영 검토와 포인트 반영은 아직 완료되지 않았습니다.</p>
            ) : approvedDemo ? (
              <>
                <p>{place.nameKo} {demoLabels.visitApproved}</p>
                {award ? (
                  <div className="result-stats">
                    <div><small>{demoLabels.visit}</small><strong>{award.visit}P</strong></div>
                    <div><small>{demoLabels.dwellBonus}</small><strong>{award.dwell}P</strong></div>
                    <div><small>{demoLabels.localSpend}</small><strong>{award.localSpend}P</strong></div>
                    <div><small>{demoLabels.accommodation}</small><strong>{award.accommodation}P</strong></div>
                  </div>
                ) : null}
                {award ? <p><strong>{demoLabels.validPoints} +{award.cappedPoints}P</strong></p> : null}
                {impact ? (
                  <div className="mission-impact" role="status" aria-live="polite" aria-label={demoLabels.impactSummary}>
                    <p>{impact.territoryName} {demoLabels.territoryShare} · {impact.territoryShareBefore.toFixed(1)}% → {impact.territoryShareAfter.toFixed(1)}%</p>
                    <p>{demoLabels.stronghold} · {impact.strongholdBefore} → {impact.strongholdAfter}</p>
                    <p>{demoLabels.fandomRank} · #{impact.fandomRankBefore} → #{impact.fandomRankAfter}</p>
                    <p>{demoLabels.personalRank} · #{impact.personalRankBefore} → #{impact.personalRankAfter}</p>
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <p>{place.nameKo} 방문이 승인됐어요.</p>
                <div className="result-stats">
                  <div aria-label={`팬덤 기여 ${result.awardedPoints}P`}><small>팬덤 기여</small><strong>+{result.awardedPoints}P</strong></div>
                  <div aria-label={`부산 탈환까지 ${result.pointsToCapture}P`}><small>부산 탈환까지</small><strong>{result.pointsToCapture}P</strong></div>
                </div>
              </>
            )}
            <button className="primary-button" onClick={onClose}>{mode === "integrated" ? "여행 계속하기" : demoLabels.continue}</button>
          </section>
        ) : (
          <>
            <div className="checkin-place">
              <span className="place-flag"><Shield /></span>
              <div>
                <span>{place.categoryLabel}</span>
                <h2>{place.nameKo}</h2>
                <p>{mode === "integrated" ? "현재 위치 3회와 현장 사진으로 방문을 제출합니다." : demoLabels.intro}</p>
              </div>
            </div>
            <div className="checkin-steps" role="status" aria-live="polite">
              <article>
                <span className="step-icon"><LocateFixed /></span>
                <div><h3>{mode === "integrated" ? "현재 위치 3회" : demoLabels.gpsTitle}</h3><p>{mode === "demo" && progress.gpsCount === 3 ? demoLabels.gpsDone : `${progress.gpsCount}/3 ${mode === "integrated" ? "수집" : "collected"}`}</p></div>
                <strong>{progress.gpsCount === 3 ? <Check /> : mode === "integrated" ? "대기" : demoLabels.pending}</strong>
              </article>
              <article>
                <span className="step-icon"><Camera /></span>
                <div><h3>{mode === "integrated" ? "현장 사진" : demoLabels.photoTitle}</h3><p>{mode === "demo" ? (state.photoAssetId ? demoLabels.photoDone : demoLabels.photoPrompt) : "원본 사진을 비공개 검토용으로 업로드"}</p></div>
                <strong>{state.photoAssetId ? <Check /> : mode === "integrated" ? "대기" : demoLabels.pending}</strong>
              </article>
              {mode === "demo" ? (
                <article>
                  <div><h3>{demoLabels.dwellTitle}</h3><p>{state.demoEvidence.simulatedDwellMinutes > 0 ? demoLabels.dwellDone : demoLabels.pending}</p></div>
                  <strong>{state.demoEvidence.simulatedDwellMinutes > 0 ? <Check /> : demoLabels.pending}</strong>
                </article>
              ) : null}
            </div>

            {mode === "demo" && demoEvidenceComplete ? (
              <fieldset className="demo-evidence-options">
                <legend>{demoLabels.extra}</legend>
                <label>
                  <input
                    type="checkbox"
                    checked={state.demoEvidence.localSpendVerified}
                    onChange={(event) => dispatch({ type: "setDemoEvidence", field: "localSpendVerified", value: event.target.checked })}
                  />
                  {demoLabels.includeSpend}
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={state.demoEvidence.accommodationVerified}
                    onChange={(event) => dispatch({ type: "setDemoEvidence", field: "accommodationVerified", value: event.target.checked })}
                  />
                  {demoLabels.includeStay}
                </label>
              </fieldset>
            ) : null}

            {evidenceIssue ? <StateMessage tone="warning" title="증거를 수집하지 못했어요">{evidenceIssue}</StateMessage> : null}
            {state.issue === "network_failed" ? <StateMessage tone="warning" title={mode === "integrated" ? "체크인 저장에 실패했어요" : demoLabels.saveFailed}>{mode === "integrated" ? "네트워크 연결을 확인하고 다시 시도해 주세요." : demoLabels.saveFailedBody}</StateMessage> : null}
            {mode === "integrated" && progress.gpsCount < 3 ? (
              <button className="primary-button" disabled={state.sessionId.startsWith("pending-") || busy} onClick={() => void collectLocation()}>
                {busy ? "위치 확인 중" : "실제 위치 확인"}
              </button>
            ) : null}
            {mode === "integrated" && progress.gpsCount === 3 && !state.photoAssetId ? (
              <label className="primary-button file-button">
                현장 사진 선택
                <input aria-label="현장 사진 선택" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={busy} onChange={(event) => void uploadPhoto(event)} />
              </label>
            ) : null}
            {mode === "demo" && !demoEvidenceComplete ? (
              <button className="primary-button" disabled={state.sessionId.startsWith("pending-") || busy} onClick={runDemo}>{demoLabels.runDemo}</button>
            ) : null}
            {mode === "demo" && demoEvidenceComplete && !state.demoEvidence.reviewAccepted ? (
              <button className="primary-button" onClick={() => dispatch({ type: "acceptDemoReview" })}>{demoLabels.review}</button>
            ) : null}
            {progress.canSubmit && state.issue !== "network_failed" ? (
              <button className="primary-button" disabled={busy} onClick={() => void submit()}>{mode === "integrated" ? "체크인 제출" : demoLabels.submit}</button>
            ) : null}
            {state.status === "submitting" && state.issue === "network_failed" ? (
              <button className="primary-button" disabled={busy} onClick={() => void submit()}>{mode === "integrated" ? "다시 제출" : demoLabels.retry}</button>
            ) : null}
            <p className="privacy-note">{mode === "integrated" ? "위치 좌표와 원본 사진은 체크인 검토를 위해 비공개 저장됩니다. 현재 버전은 EXIF를 제거하지 않습니다." : demoLabels.privacy}</p>
          </>
        )}
      </div>
    </div>
  );
}
