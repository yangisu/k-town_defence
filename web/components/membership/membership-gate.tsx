"use client";
import { type ReactNode, useEffect } from "react";
import { useMembership } from "@/features/membership/membership-context";
const copy: Record<string, string> = { AUTHENTICATION_REQUIRED: "로그인이 필요해요", CURRENT_SEASON_NOT_CONFIGURED: "현재 시즌을 준비하고 있어요", FANDOM_NOT_FOUND: "선택한 팬덤을 찾을 수 없어요", FANDOM_LOCKED: "이번 시즌 팬덤은 변경할 수 없어요", UNKNOWN_ERROR: "팬덤 정보를 불러오지 못했어요" };
export function MembershipGate({ children }: { children: ReactNode }) {
  const { status, error, retry } = useMembership();
  const needsSignIn = status === "error" && error?.code === "AUTHENTICATION_REQUIRED";
  useEffect(() => {
    if (!needsSignIn || typeof window === "undefined") return;
    const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.replace(`/signin?return_to=${returnTo}`);
  }, [needsSignIn]);
  if (status === "loading") return <main className="membership-gate"><section className="membership-card" role="status">팬덤 정보를 불러오고 있어요</section></main>;
  if (status === "error" && error?.code === "AUTHENTICATION_REQUIRED") {
    // A visitor who is not signed in belongs on the sign-in screen, not on a
    // page whose only control is a link to it.
    return <main className="membership-gate" role="status">로그인 화면으로 이동하고 있어요</main>;
  }
  if (status === "error") return <main className="membership-gate"><section className="membership-card"><h1>{copy[error?.code ?? "UNKNOWN_ERROR"] ?? copy.UNKNOWN_ERROR}</h1><button onClick={() => void retry()}>다시 시도</button></section></main>;
  // A member without a fandom yet gets the product's own first-run picker,
  // the one the demo opens with, instead of a separate form here.
  return children;
}

export function membershipErrorCopy(code: string) {
  return copy[code] ?? copy.UNKNOWN_ERROR;
}
