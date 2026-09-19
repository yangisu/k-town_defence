"use client";

import { DemoBrandLockup } from "@/components/demo-entry/demo-brand-lockup";

/**
 * The demo gate is a doorway, not an account: the real product signs in with
 * Kakao or Google on /signin, and typing a throwaway email and password here
 * only stood between a visitor and the demo they came to see.
 */
export function DemoLogin({ onComplete }: { onComplete(): void }) {
  return (
    <main className="demo-entry-screen demo-login-screen">
      <section className="demo-login-card" aria-labelledby="demo-login-title">
        <DemoBrandLockup />
        <h1 id="demo-login-title">데모 체험하기</h1>
        <p>가입 없이 바로 둘러볼 수 있어요. 좋아하는 아티스트를 고르고 전국의 영토를 지켜 보세요.</p>
        <button type="button" className="demo-login-start" onClick={onComplete}>
          데모 시작하기
        </button>
        <small className="demo-login-note">
          체험용 화면입니다. 실제 계정으로 시작하려면 <a href="/signin">로그인</a>하세요.
        </small>
      </section>
    </main>
  );
}
