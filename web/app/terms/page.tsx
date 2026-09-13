import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "서비스 이용약관 | K-Town Defense",
};

export default function TermsPage() {
  return (
    <main className="legal-page">
      <article>
        <Link className="legal-home" href="/">← K-Town Defense</Link>
        <span className="eyebrow">TERMS</span>
        <h1>서비스 이용약관</h1>
        <p className="legal-lead">K-Town Defense를 이용하기 전에 아래 내용을 확인해 주세요.</p>

        <h2>1. 서비스</h2>
        <p>
          K-Town Defense는 K-POP 팬덤을 기반으로 지역과 관광 정보를 탐색하고, 사용자의 팬덤 선택 및 여행·체크인 기록을
          계정별로 보관하는 서비스입니다. 기능은 운영 과정에서 변경되거나 추가될 수 있습니다.
        </p>

        <h2>2. 계정</h2>
        <p>
          사용자는 Kakao, NAVER 또는 Google 계정으로 로그인할 수 있습니다. 계정 접근 수단을 안전하게 관리해야 하며,
          타인의 계정이나 정보를 허가 없이 사용해서는 안 됩니다. 서로 다른 소셜 제공자로 로그인한 계정은 별도 계정으로
          처리될 수 있습니다.
        </p>

        <h2>3. 체크인과 제출 콘텐츠</h2>
        <p>
          위치와 사진은 사용자가 명시적으로 제출한 경우에만 저장됩니다. 사용자는 제출 콘텐츠에 필요한 권리를 보유해야 하며,
          타인의 개인정보, 불법 콘텐츠 또는 서비스 운영을 방해하는 자료를 제출해서는 안 됩니다. 체크인 제출 상태가
          <strong> pending</strong>인 경우 운영자의 승인이나 포인트 지급이 완료됐다는 의미가 아닙니다.
        </p>

        <h2>4. 이용 제한</h2>
        <p>
          부정 로그인, 자동화된 남용, 위치 조작, 권리 침해 또는 법령·약관 위반이 확인되면 관련 제출을 거절하거나 서비스
          이용을 제한할 수 있습니다.
        </p>

        <h2>5. 서비스 제공과 책임</h2>
        <p>
          안정적인 운영을 위해 노력하지만 점검, 장애, 외부 로그인 제공자 또는 통신 환경으로 서비스가 일시 중단될 수
          있습니다. 관광지 정보와 팬덤 순위는 참고용이며 실제 현장 상황이나 공식 순위를 보증하지 않습니다.
        </p>

        <h2>6. 문의</h2>
        <p><a href="mailto:yangisu12@gmail.com">yangisu12@gmail.com</a></p>

        <p className="legal-updated">시행일: 2026년 9월 14일</p>
      </article>
    </main>
  );
}
