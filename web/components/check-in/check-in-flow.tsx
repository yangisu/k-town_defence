"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import type { CheckInResult, CheckInService, Place } from "@/lib/domain";
import { Camera, Check, Clock3, LocateFixed, Shield, X } from "@/components/ui/icons";
import { checkInReducer, createInitialCheckInState, deriveCheckInProgress } from "./check-in-reducer";
import { StateMessage } from "@/components/ui/state-message";

export function CheckInFlow({ place, service, onClose }: { place: Place; service: CheckInService; onClose: () => void }) {
  const [state, dispatch] = useReducer(checkInReducer, createInitialCheckInState(`demo-${place.id}`, place.id, `submit-${place.id}`));
  const [result, setResult] = useState<CheckInResult | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const progress = deriveCheckInProgress(state);
  useEffect(() => { titleRef.current?.focus(); void service.create(place.id); }, [place.id, service]);

  const advance = () => {
    dispatch({ type: "gpsSample", kind: "start", accuracyMeters: 24 }); dispatch({ type: "gpsSample", kind: "middle", accuracyMeters: 22 }); dispatch({ type: "gpsSample", kind: "end", accuracyMeters: 20 }); dispatch({ type: "photoCaptured", assetId: "demo-photo" }); dispatch({ type: "dwellUpdated", activeSeconds: 300 });
  };
  const submit = async () => { dispatch({ type: "submit" }); const next = await service.submit(state.sessionId, state.idempotencyKey); setResult(next); dispatch({ type: "resolve", decision: next.decision }); };

  return <div className="checkin-overlay" role="dialog" aria-modal="true" aria-labelledby="checkin-title"><div className="checkin-dialog">
    <header className="checkin-top"><div><span className="demo-pill">데모 체크인</span><h1 id="checkin-title" tabIndex={-1} ref={titleRef}>현장 체크인</h1></div><button className="icon-button" aria-label="체크인 닫기" onClick={onClose}><X /></button></header>
    {result ? <section className="checkin-result"><div className="result-icon"><Check size={40} /></div><span className="eyebrow">CHECK-IN APPROVED</span><h2>{result.message}</h2><p>{place.nameKo} 방문이 승인됐어요. 이 기록은 부산 여행 지도와 팬덤 점유전에 함께 반영됩니다.</p><div className="result-stats"><div aria-label={`팬덤 기여 ${result.awardedPoints}P`}><small>팬덤 기여</small><strong>+{result.awardedPoints}P</strong></div><div aria-label={`부산 탈환까지 ${result.pointsToCapture}P`}><small>부산 탈환까지</small><strong>{result.pointsToCapture}P</strong></div></div><button className="primary-button" onClick={onClose}>여행 계속하기</button></section> : <>
      <div className="checkin-place"><span className="place-flag"><Shield /></span><div><span>{place.categoryLabel}</span><h2>{place.nameKo}</h2><p>현장에서 5분간 머물며 여행을 인증해 주세요.</p></div></div>
      <section className="timer-card" aria-label="활성 체류 시간"><span>ACTIVE DWELL TIME</span><strong>{progress.canSubmit ? "05:00" : "03:42"}</strong><small>{progress.canSubmit ? "모든 현장 인증 조건을 충족했어요" : "위치가 안정적으로 확인되고 있어요"}</small><div className="timer-progress"><i style={{ width: `${progress.dwellPercent || 74}%` }} /></div></section>
      <div className="checkin-steps" role="status" aria-live="polite"><article><span className="step-icon"><LocateFixed /></span><div><h3>GPS 시작 · 중간 · 종료</h3><p>정확도 24m · {progress.gpsCount}/3 수집</p></div><strong>{progress.gpsCount === 3 ? <Check /> : "진행 중"}</strong></article><article><span className="step-icon"><Camera /></span><div><h3>현장 사진</h3><p>체크인 카메라 촬영 증빙</p></div><strong>{state.photoAssetId ? <Check /> : "대기"}</strong></article><article><span className="step-icon"><Clock3 /></span><div><h3>5분 현장 체류</h3><p>{progress.canSubmit ? "체류 조건 완료" : "1분 18초 남음"}</p></div><strong>{progress.dwellPercent || 74}%</strong></article></div>
      {state.issue === "low_accuracy" ? <StateMessage tone="warning" title="위치 정확도가 낮아요">현재 124m입니다. 제출 기준인 100m 안으로 안정될 때까지 잠시 기다려 주세요.</StateMessage> : null}
      <div className="checkin-impact"><small>이 체크인의 지역 효과</small><strong>팬덤 100P · 원정 보너스 20P</strong><span>부산 탈환까지 300P 남게 됩니다</span></div>
      {!progress.canSubmit ? <button className="primary-button" onClick={advance}>인증 과정 진행</button> : <button className="primary-button" onClick={() => void submit()}>체크인 제출</button>}
      <p className="privacy-note">GPS와 카메라는 체크인 중에만 사용하는 데모 흐름입니다.</p>
    </>}
  </div></div>;
}
