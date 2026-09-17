import { isProviderConfigured, SOCIAL_PROVIDERS, type SocialProvider } from "@/lib/server/social-auth";

const PROVIDER_LABEL_KO: Record<SocialProvider, string> = {
  kakao: "카카오로 시작하기",
  google: "구글로 시작하기",
};

export function SocialLoginButtons({ returnTo = "/" }: { returnTo?: string }) {
  const providers = SOCIAL_PROVIDERS.filter(isProviderConfigured);
  return (
    <div className="social-login-list">
      {providers.map((provider) => (
        <a
          key={provider}
          className={`primary-button social-login-button social-login-button--${provider}`}
          href={`/api/auth/${provider}?return_to=${encodeURIComponent(returnTo)}`}
        >
          {PROVIDER_LABEL_KO[provider]}
        </a>
      ))}
    </div>
  );
}
