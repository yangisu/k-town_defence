"use client";
import { type FormEvent, type ReactNode, useRef, useState } from "react";
import { useMembership } from "@/features/membership/membership-context";
import { FandomOption } from "./fandom-option";
const copy: Record<string, string> = { AUTHENTICATION_REQUIRED: "로그인이 필요해요", CURRENT_SEASON_NOT_CONFIGURED: "현재 시즌을 준비하고 있어요", FANDOM_NOT_FOUND: "선택한 팬덤을 찾을 수 없어요", FANDOM_LOCKED: "이번 시즌 팬덤은 변경할 수 없어요", UNKNOWN_ERROR: "팬덤 정보를 불러오지 못했어요" };
export function MembershipGate({ children }: { children: ReactNode }) {
  const { status, fandoms, error, isSelecting, selectFandom, retry } = useMembership(); const [selected, setSelected] = useState(""); const [invalid, setInvalid] = useState(false); const first = useRef<HTMLInputElement>(null);
  if (status === "loading") return <main className="membership-gate"><section className="membership-card" role="status">팬덤 정보를 불러오고 있어요</section></main>;
  if (status === "error") return <main className="membership-gate"><section className="membership-card"><h1>{copy[error?.code ?? "UNKNOWN_ERROR"] ?? copy.UNKNOWN_ERROR}</h1><button onClick={() => void retry()}>다시 시도</button></section></main>;
  if (status === "ready") return children;
  const submit = (event: FormEvent) => { event.preventDefault(); if (!selected) { setInvalid(true); first.current?.focus(); return; } void selectFandom(selected); };
  return <main className="membership-gate"><form className="membership-card" onSubmit={submit}><span className="eyebrow">SEASON MEMBERSHIP</span><h1>함께 여행할 팬덤을 선택해 주세요</h1><p>부산 탐험 기록이 선택한 팬덤에 연결돼요.</p><fieldset disabled={isSelecting}><legend className="sr-only">팬덤 선택</legend><div className="fandom-options">{fandoms.map((fandom, index) => <FandomOption key={fandom.id} ref={index ? undefined : first} fandom={fandom} checked={selected === fandom.id} disabled={isSelecting} onChange={() => { setSelected(fandom.id); setInvalid(false); }} />)}</div></fieldset>{invalid && <p role="alert">팬덤을 선택해 주세요</p>}{error && <p role="alert">{copy[error.code] ?? copy.UNKNOWN_ERROR}</p>}{isSelecting && <p role="status">팬덤을 저장하고 있어요</p>}<button className="primary-button" disabled={isSelecting}>이 팬덤으로 시즌 시작</button></form></main>;
}
