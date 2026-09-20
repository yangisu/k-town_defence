import { SocialLoginButtons } from "@/components/auth/social-login-buttons";
import { DemoBrandLockup } from "@/components/demo-entry/demo-brand-lockup";
import { isProviderConfigured, SOCIAL_PROVIDERS } from "@/lib/server/social-auth";

export function IntegratedLogin({ returnTo }: { returnTo: string }) {
  const hasConfiguredProvider = SOCIAL_PROVIDERS.some(isProviderConfigured);

  return (
    <main className="demo-entry-screen demo-login-screen">
      <section className="demo-login-card" aria-labelledby="integrated-login-title">
        <DemoBrandLockup />
        <h1 id="integrated-login-title">K-TOWN 시작하기</h1>
        <p>로그인하고 응원하는 아티스트와 함께 전국의 영토를 지켜 보세요.</p>
        {hasConfiguredProvider ? (
          <SocialLoginButtons returnTo={returnTo} />
        ) : (
          <p className="signin-error" role="status">SNS 로그인을 준비하고 있어요.</p>
        )}
        <small className="demo-login-note">
          로그인하면 <a href="/terms">이용약관</a>과 <a href="/privacy">개인정보처리방침</a>에 동의하는 것으로 봅니다.
          {hasConfiguredProvider ? null : <> <a href="/demo">체험 모드</a>는 계속 이용할 수 있어요.</>}
        </small>
      </section>
    </main>
  );
}
