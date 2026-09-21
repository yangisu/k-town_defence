import { KTownMark } from "@/components/brand/ktown-mark";
import { SocialLoginButtons } from "@/components/auth/social-login-buttons";
import { isProviderConfigured, SOCIAL_PROVIDERS } from "@/lib/server/social-auth";

/** The same light card as /signin: the provider buttons keep their brand
 *  colours, and Kakao's yellow reads far better on the product's own paper
 *  than on the demo entry's dark ground. Only the look is shared — the sign-in
 *  itself is still the social buttons and the server session behind them. */
export function IntegratedLogin({ returnTo }: { returnTo: string }) {
  const hasConfiguredProvider = SOCIAL_PROVIDERS.some(isProviderConfigured);

  return (
    <main className="signin-screen">
      <section className="signin-card" aria-labelledby="integrated-login-title">
        <KTownMark className="signin-mark" />
        <h1 id="integrated-login-title">로그인</h1>
        {hasConfiguredProvider ? null : (
          <p>SNS 로그인을 준비하고 있어요. 지금은 체험 모드로 둘러볼 수 있습니다.</p>
        )}
        {hasConfiguredProvider ? <SocialLoginButtons returnTo={returnTo} /> : (
          <a className="signin-demo-link" href="/demo">체험 모드로 둘러보기</a>
        )}
        <small className="signin-note">
          로그인하면 <a href="/terms">이용약관</a>과 <a href="/privacy">개인정보처리방침</a>에 동의하는 것으로 봅니다.
        </small>
      </section>
    </main>
  );
}
