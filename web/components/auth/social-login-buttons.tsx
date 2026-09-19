import { isProviderConfigured, SOCIAL_PROVIDERS, type SocialProvider } from "@/lib/server/social-auth";

/**
 * Both providers publish a branding guideline that governs the wording, the
 * symbol and the colours of their sign-in button:
 * https://developers.kakao.com/docs/ko/kakaologin/design-guide
 * https://developers.google.com/identity/branding-guidelines
 *
 * Kakao asks for its speech-bubble symbol on #FEE500 with black 85% label text
 * and the wording "카카오 로그인". Google asks for the four-colour G, the
 * wording "Google 계정으로 로그인", and a white button with a #747775 border.
 * Neither symbol may be recoloured or resized, so both are inline SVG at the
 * sizes the guidelines give, and neither button may be quieter than the other.
 */
const PROVIDER_LABEL_KO: Record<SocialProvider, string> = {
  kakao: "카카오 로그인",
  google: "Google 계정으로 로그인",
};

function KakaoSymbol() {
  return (
    <svg className="social-login-symbol" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <path
        fill="#000000"
        d="M9 1.5C4.58 1.5 1 4.28 1 7.71c0 2.2 1.47 4.13 3.68 5.22-.16.57-.58 2.1-.67 2.43-.11.41.15.4.32.29.13-.09 2.1-1.42 2.95-2 .56.08 1.14.13 1.72.13 4.42 0 8-2.78 8-6.21C17 4.28 13.42 1.5 9 1.5Z"
      />
    </svg>
  );
}

function GoogleSymbol() {
  return (
    <svg className="social-login-symbol" width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65Z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19Z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z" />
    </svg>
  );
}

const PROVIDER_SYMBOL: Record<SocialProvider, () => React.JSX.Element> = {
  kakao: KakaoSymbol,
  google: GoogleSymbol,
};

export function SocialLoginButtons({ returnTo = "/" }: { returnTo?: string }) {
  const providers = SOCIAL_PROVIDERS.filter(isProviderConfigured);
  return (
    <div className="social-login-list">
      {providers.map((provider) => {
        const Symbol = PROVIDER_SYMBOL[provider];
        return (
          <a
            key={provider}
            className={`social-login-button social-login-button--${provider}`}
            href={`/api/auth/${provider}?return_to=${encodeURIComponent(returnTo)}`}
          >
            <Symbol />
            <span>{PROVIDER_LABEL_KO[provider]}</span>
          </a>
        );
      })}
    </div>
  );
}
