import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "개인정보처리방침 | K-Town Defense",
};

export default function PrivacyPage() {
  return (
    <main className="legal-page">
      <article>
        <Link className="legal-home" href="/">← K-Town Defense</Link>
        <span className="eyebrow">PRIVACY</span>
        <h1>개인정보처리방침</h1>
        <p className="legal-lead">
          K-Town Defense는 소셜 로그인과 팬덤 여행 서비스를 제공하는 데 필요한 최소한의 정보만 처리합니다.
        </p>

        <h2>1. 처리하는 정보</h2>
        <ul>
          <li>카카오·Google이 제공하는 계정 식별자, 닉네임, 프로필 이미지</li>
          <li>서비스 내부 사용자 식별자와 선택한 팬덤·시즌 멤버십</li>
          <li>체크인 시 사용자가 제출한 위치, 사진, 방문 장소와 처리 상태</li>
          <li>로그인 세션 유지를 위한 보안 쿠키</li>
        </ul>
        <p>소셜 로그인 제공자의 액세스 토큰과 갱신 토큰은 로그인 처리 후 저장하지 않습니다.</p>

        <h2>2. 이용 목적</h2>
        <ul>
          <li>사용자 식별, 로그인 유지와 계정별 기록 복원</li>
          <li>팬덤 멤버십, 여행 경로와 체크인 기록 제공</li>
          <li>부정 이용 방지, 오류 대응과 서비스 보안 유지</li>
        </ul>

        <h2>3. 보관과 삭제</h2>
        <p>
          계정 정보와 활동 기록은 서비스 이용 기간 동안 보관합니다. 회원 탈퇴 또는 소셜 계정 연결 해제 요청이 확인되면
          관련 정보를 삭제하거나 관계 법령상 필요한 기간 동안 분리 보관합니다. 제출 사진은 공개 파일 경로가 아닌 비공개
          저장소에 보관합니다.
        </p>

        <h2>4. 외부 서비스와 처리 위치</h2>
        <p>
          로그인 인증에는 Kakao, Google의 OAuth 서비스를 사용합니다. 서비스 데이터는 대한민국 서울 리전의
          AWS EC2 및 서비스 전용 PostgreSQL에 저장되며, 데이터베이스는 인터넷에 직접 공개하지 않습니다.
        </p>

        <h2>5. 쿠키</h2>
        <p>
          로그인 상태를 유지하기 위해 서명된 HttpOnly·Secure 쿠키를 최대 30일 동안 사용합니다. 브라우저에서 쿠키를
          삭제하면 로그아웃되며, 세션 서명 키가 변경된 경우에도 기존 세션은 무효화됩니다.
        </p>

        <h2>6. 문의</h2>
        <p><a href="mailto:yangisu12@gmail.com">yangisu12@gmail.com</a></p>

        <p className="legal-updated">시행일: 2026년 9월 14일</p>
      </article>
    </main>
  );
}
