import { SocialLoginButtons } from "@/components/auth/social-login-buttons";
import { safeRelativeReturnPath } from "@/lib/server/return-path";

const ERROR_MESSAGE_KO: Record<string, string> = {
  unknown_provider: "지원하지 않는 로그인 방식입니다.",
  invalid_state: "로그인 요청이 만료되었습니다. 다시 시도해 주세요.",
  profile_unavailable: "로그인 제공자에서 프로필을 가져오지 못했습니다.",
  backend_not_configured: "서비스 설정이 완료되지 않았습니다.",
  profile_upsert_failed: "로그인 처리 중 오류가 발생했습니다.",
};

type PageProps = {
  searchParams: Promise<{ return_to?: string; error?: string }>;
};

export default async function SignInPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const returnTo = safeRelativeReturnPath(params.return_to ?? "/");
  const errorMessage = params.error ? ERROR_MESSAGE_KO[params.error] ?? "로그인에 실패했습니다." : null;

  return (
    <main className="membership-gate">
      <div className="membership-card">
        <span className="eyebrow">K-TOWN DEFENSE</span>
        <h1>SNS 계정으로 로그인</h1>
        <p>카카오, 네이버, 구글 계정으로 바로 시작할 수 있어요.</p>
        {errorMessage ? (
          <div className="state-message warning" role="alert">
            <p>{errorMessage}</p>
          </div>
        ) : null}
        <SocialLoginButtons returnTo={returnTo} />
      </div>
    </main>
  );
}
