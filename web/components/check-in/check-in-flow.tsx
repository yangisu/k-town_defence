"use client";

import { type ChangeEvent, useEffect, useReducer, useRef, useState } from "react";
import type { CheckInResult, CheckInService, Place } from "@/lib/domain";
import { BrowserEvidenceError, collectGpsSamples } from "@/lib/browser-evidence";
import { Camera, Check, LocateFixed, Shield, X } from "@/components/ui/icons";
import { checkInReducer, createInitialCheckInState, deriveCheckInProgress } from "./check-in-reducer";
import { StateMessage } from "@/components/ui/state-message";

type Props = { place: Place; service: CheckInService; mode?: "demo" | "integrated"; geolocation?: Geolocation; onClose: () => void };
const gpsKinds = ["start", "middle", "end"] as const;

export function CheckInFlow({ place, service, mode = "demo", geolocation, onClose }: Props) {
  const [idempotencyKey] = useState(() => globalThis.crypto.randomUUID());
  const [state, dispatch] = useReducer(checkInReducer, createInitialCheckInState(`pending-${place.id}`, place.id, idempotencyKey));
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [evidenceIssue, setEvidenceIssue] = useState<string | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const progress = deriveCheckInProgress(state);

  useEffect(() => {
    titleRef.current?.focus();
    let active = true;
    void service.create(place.id).then((session) => { if (active) dispatch({ type: "sessionCreated", sessionId: session.id }); }).catch(() => { if (active) dispatch({ type: "issue", issue: "network_failed" }); });
    return () => { active = false; };
  }, [place.id, service]);

  const collectLocation = async () => {
    if (state.sessionId.startsWith("pending-") || busy) return;
    setBusy(true); setEvidenceIssue(null);
    try {
      const source = geolocation ?? (typeof navigator === "undefined" ? undefined : navigator.geolocation);
      const samples = await collectGpsSamples(source, 3);
      for (const [index, sample] of samples.entries()) {
        await service.recordGps(state.sessionId, sample);
        dispatch({ type: "gpsSample", kind: gpsKinds[index], accuracyMeters: sample.accuracyMeters });
      }
    } catch (error) {
      if (error instanceof BrowserEvidenceError) setEvidenceIssue(error.code === "location_denied" ? "위치 권한이 거부됐습니다. 브라우저 설정에서 허용해 주세요." : "현재 위치를 확인하지 못했습니다. 다시 시도해 주세요.");
      else dispatch({ type: "issue", issue: "network_failed" });
    } finally { setBusy(false); }
  };

  const uploadPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || state.sessionId.startsWith("pending-")) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024) {
      setEvidenceIssue("10MiB 이하 JPEG, PNG 또는 WebP 사진을 선택해 주세요."); return;
    }
    setBusy(true); setEvidenceIssue(null);
    try {
      await service.recordPhoto(state.sessionId, { file, capturedAt: new Date().toISOString() });
      dispatch({ type: "photoCaptured", assetId: file.name });
    } catch { dispatch({ type: "issue", issue: "network_failed" }); }
    finally { setBusy(false); }
  };

  const runDemo = () => {
    dispatch({ type: "gpsSample", kind: "start", accuracyMeters: 24 });
    dispatch({ type: "gpsSample", kind: "middle", accuracyMeters: 22 });
    dispatch({ type: "gpsSample", kind: "end", accuracyMeters: 20 });
    dispatch({ type: "photoCaptured", assetId: "demo-photo" });
  };

  const submit = async () => {
    dispatch({ type: "submit" });
    try { const next = await service.submit(state.sessionId, state.idempotencyKey); setResult(next); dispatch({ type: "resolve", decision: next.decision }); }
    catch { dispatch({ type: "issue", issue: "network_failed" }); }
  };

  return <div className="checkin-overlay" role="dialog" aria-modal="true" aria-labelledby="checkin-title"><div className="checkin-dialog">
    <header className="checkin-top"><div><span className="demo-pill">{mode === "integrated" ? "실제 체크인" : "데모 체크인"}</span><h1 id="checkin-title" tabIndex={-1} ref={titleRef}>현장 체크인</h1></div><button className="icon-button" aria-label="체크인 닫기" onClick={onClose}><X /></button></header>
    {result ? <section className="checkin-result"><div className="result-icon"><Check size={40} /></div><span className="eyebrow">{result.decision === "pending" ? "CHECK-IN PENDING" : "CHECK-IN APPROVED"}</span><h2>{result.message}</h2>{result.decision === "pending" ? <p>{place.nameKo} 체크인이 DB에 저장됐습니다. 운영 검토와 포인트 반영은 아직 완료되지 않았습니다.</p> : <><p>{place.nameKo} 방문이 승인됐어요.</p><div className="result-stats"><div aria-label={`팬덤 기여 ${result.awardedPoints}P`}><small>팬덤 기여</small><strong>+{result.awardedPoints}P</strong></div><div aria-label={`부산 탈환까지 ${result.pointsToCapture}P`}><small>부산 탈환까지</small><strong>{result.pointsToCapture}P</strong></div></div></>}<button className="primary-button" onClick={onClose}>여행 계속하기</button></section> : <>
      <div className="checkin-place"><span className="place-flag"><Shield /></span><div><span>{place.categoryLabel}</span><h2>{place.nameKo}</h2><p>{mode === "integrated" ? "현재 위치 3회와 현장 사진으로 방문을 제출합니다." : "데모 인증을 진행해 주세요."}</p></div></div>
      <div className="checkin-steps" role="status" aria-live="polite"><article><span className="step-icon"><LocateFixed /></span><div><h3>현재 위치 3회</h3><p>{progress.gpsCount}/3 수집</p></div><strong>{progress.gpsCount === 3 ? <Check /> : "대기"}</strong></article><article><span className="step-icon"><Camera /></span><div><h3>현장 사진</h3><p>원본 사진을 비공개 검토용으로 업로드</p></div><strong>{state.photoAssetId ? <Check /> : "대기"}</strong></article></div>
      {evidenceIssue ? <StateMessage tone="warning" title="증거를 수집하지 못했어요">{evidenceIssue}</StateMessage> : null}
      {state.issue === "network_failed" ? <StateMessage tone="warning" title="체크인 저장에 실패했어요">네트워크 연결을 확인하고 다시 시도해 주세요.</StateMessage> : null}
      {mode === "integrated" && progress.gpsCount < 3 ? <button className="primary-button" disabled={state.sessionId.startsWith("pending-") || busy} onClick={() => void collectLocation()}>{busy ? "위치 확인 중" : "실제 위치 확인"}</button> : null}
      {mode === "integrated" && progress.gpsCount === 3 && !state.photoAssetId ? <label className="primary-button file-button">현장 사진 선택<input aria-label="현장 사진 선택" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={busy} onChange={(event) => void uploadPhoto(event)} /></label> : null}
      {mode === "demo" && !progress.canSubmit ? <button className="primary-button" onClick={runDemo}>인증 과정 진행</button> : null}
      {progress.canSubmit ? <button className="primary-button" disabled={busy} onClick={() => void submit()}>체크인 제출</button> : null}
      <p className="privacy-note">{mode === "integrated" ? "위치 좌표와 원본 사진은 체크인 검토를 위해 비공개 저장됩니다. 현재 버전은 EXIF를 제거하지 않습니다." : "이 화면은 실제 위치나 사진을 전송하지 않는 데모입니다."}</p>
    </>}
  </div></div>;
}
