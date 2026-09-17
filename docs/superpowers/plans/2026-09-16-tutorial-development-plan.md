# K-Town Defense 튜토리얼 개발 계획

## 1. 목표

첫 방문 사용자가 별도의 설명 없이 다음 핵심 흐름을 완료하도록 한다.

`팬덤 선택 -> 추천 영토 선택 -> 원정 시작 -> 첫 체크인 진입`

튜토리얼은 별도 사용 설명 페이지가 아니라 실제 화면의 조작 대상을 단계별로 강조하고, 사용자의 실제 행동을 완료 조건으로 삼는다.

## 2. 실현 가능성 검증

### 검증한 현재 구조

- `KTownApp`이 데모 앱과 통합 앱을 나누고 있으며, 데모 흐름은 `DemoSessionProvider`가 관리한다.
- 데모 세션은 이미 `localStorage`에 저장되고 새로고침 시 복원된다.
- 팬덤 선택은 데모 모드에서 `ProfileSetup`, 통합 모드에서 `MembershipGate`가 담당한다.
- 영토 선택은 `TerritoryView`와 지도 목록에서 모두 가능하다.
- 영토 선택 후 `TacticalPanel`의 `원정 시작`이 `DemoSession` 상태를 원정 탭으로 전환한다.
- `PreviewExpeditionView`에는 장소별 체크인 버튼이 있고, 체크인 모달은 별도의 포커스 관리와 위치·사진 검증 흐름을 갖고 있다.
- 기존 골든 패스 테스트가 팬덤 선택부터 체크인 결과와 상태 복원까지 검증한다.
- 지도 설정이 없는 테스트 환경에서도 영토 목록으로 핵심 흐름을 진행할 수 있다.

### 결론

계획은 현재 구조에서 구현 가능하다. 다만 다음 두 가지를 반영한다.

1. 튜토리얼 전용 전역 상태를 기존 게임 세션 상태와 합치지 않는다. 튜토리얼 상태는 별도 컨텍스트와 별도 저장 키로 관리한다.
2. 데모 모드와 통합 모드의 첫 단계가 다르다. 데모 모드는 `ProfileSetup`을 강조하고, 통합 모드는 `MembershipGate`를 통과한 뒤 첫 영토 화면에서 튜토리얼을 시작한다.

### 기준 검증 결과

2026-09-16 기준 `npm test` 실행에서 41개 테스트 파일 중 29개 파일과 177개 테스트가 통과했다. 나머지 테스트 파일은 `territory-map.tsx`의 기존 import인 `maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url`을 Vite가 해석하지 못해 변환 단계에서 실패했고, self-hosted build 검증도 같은 원인으로 실패했다.

따라서 튜토리얼 개발을 시작하기 전에 지도 워커 import 문제를 별도 작업으로 해결하거나, 튜토리얼 단위 테스트에서 지도 구현을 mock해야 한다. 이 계획은 해당 기존 문제를 튜토리얼 기능의 회귀로 간주하지 않으며, 구현 완료 기준에는 기존 워커 문제 해결 또는 명시된 테스트 mock 전략을 포함한다.

### 검증 명령

```powershell
Set-Location d:\compe\travel_data\web
npm test
npm run lint
npm run build
```

구현 전에 위 명령을 실행해 기준 상태를 기록한다. 구현 후에는 새 테스트와 함께 같은 명령을 다시 실행한다.

## 3. 범위

### MVP 포함

- 첫 방문 4단계 온보딩
- 현재 조작 대상 하나를 강조하는 오버레이
- `다음`, `건너뛰기`, `닫기` 동작
- 사용자의 실제 클릭에 따른 단계 전환
- 완료·건너뛰기 상태 저장
- 튜토리얼 다시 보기
- 한국어·영어 문구
- 데스크톱·모바일 레이아웃
- 키보드 포커스와 `Escape` 닫기
- 체크인 화면 진입 전 GPS·사진·체류 인증 안내

### MVP 제외

- GPS나 사진 권한을 튜토리얼에서 실제로 요청하는 기능
- 튜토리얼 편집 관리자 화면
- 사용자 행동 분석 대시보드
- 체크인 전체 과정을 튜토리얼이 강제로 완료시키는 기능

체크인은 브라우저 권한과 실제 현장 증빙이 필요한 흐름이다. MVP에서는 체크인 버튼까지 안내하고, 실제 체크인 화면 내부는 기존 안내 문구를 사용한다.

## 4. 상태 및 저장 설계

```ts
type TutorialStepId =
  | "choose-fandom"
  | "open-territory"
  | "start-expedition"
  | "open-checkin";

type TutorialStatus = "idle" | "running" | "completed" | "skipped";

interface TutorialState {
  status: TutorialStatus;
  step: TutorialStepId;
  isReplay: boolean;
}
```

저장 키:

```text
ktown-defense:tutorial:v1
```

저장 값에는 `status`, 마지막 단계, 콘텐츠 버전을 포함한다. 저장소 접근은 SSR을 고려해 `typeof window !== "undefined"` 조건 안에서 처리한다.

기존 `DEMO_SESSION_KEY`에는 튜토리얼 필드를 추가하지 않는다. 게임 세션 초기화와 튜토리얼 다시 보기를 독립적으로 유지해야 하기 때문이다.

## 5. 제안 파일 구조

### 새 파일

```text
web/components/tutorial/tutorial-provider.tsx
web/components/tutorial/tutorial-overlay.tsx
web/components/tutorial/tutorial-step.tsx
web/components/tutorial/tutorial-launcher.tsx
web/features/tutorial/tutorial-config.ts
web/features/tutorial/tutorial-storage.ts
web/tests/tutorial.test.tsx
```

### 수정 파일

- `web/features/ktown-app.tsx`
- `web/components/app-shell.tsx`
- `web/components/membership/membership-gate.tsx`
- `web/components/team-preview/profile-setup.tsx`
- `web/components/team-preview/territory-view.tsx`
- `web/components/team-preview/tactical-panel.tsx`
- `web/components/team-preview/expedition-view.tsx`
- `web/features/team-preview/i18n.ts`
- 기존 튜토리얼·모달 스타일이 위치한 CSS 파일

## 6. 단계별 동작

### Step 1: 팬덤 선택

대상:

- 데모 모드: 팬덤 선택 카드와 `이 팬덤으로 시즌 시작` 버튼
- 통합 모드: `MembershipGate`의 팬덤 선택 화면

안내:

> 함께 여행할 팬덤을 선택하세요. 선택한 팬덤에 맞춰 영토와 원정을 추천합니다.

완료 조건:

- 팬덤이 선택되고 시즌 시작이 완료됨
- 데모 세션의 `artistConfirmed`가 `true`가 됨
- 통합 모드에서는 멤버십 선택이 완료됨

### Step 2: 추천 영토 확인

대상:

- 영토 요약의 추천 행동 카드 또는 추천 영토 카드
- 카드가 없는 경우 지도 목록의 첫 추천 영토

대상 요소에는 스타일 클래스나 DOM 순서 대신 안정적인 속성을 추가한다.

```tsx
data-tutorial="recommended-territory"
```

안내:

> 추천 영토를 선택하면 해당 지역의 원정과 방문 장소를 확인할 수 있습니다.

완료 조건:

- 사용자가 영토 카드나 지도 목록에서 영토를 선택함
- 전술 패널이 열림

### Step 3: 원정 시작

대상:

- `TacticalPanel`의 `원정 시작` 버튼

안내:

> 원정을 시작하면 방문할 장소와 예상 포인트를 확인할 수 있습니다.

완료 조건:

- 원정 버튼 클릭
- `activeTab`이 `expedition`으로 전환됨
- 원정 제목과 장소 목록이 표시됨

### Step 4: 체크인 진입

대상:

- `PreviewExpeditionView`의 첫 장소 체크인 버튼

안내:

> 장소에 도착한 뒤 체크인을 진행하세요. 위치와 현장 사진으로 방문을 인증합니다.

체크인 진입 전 보조 안내:

- 위치 권한: 방문 장소에 실제로 있는지 확인
- 현장 사진: 방문 증빙 제출
- 체류 시간: 장소 방문 조건 확인

완료 조건:

- 첫 장소의 체크인 버튼 클릭
- 체크인 다이얼로그 표시
- 튜토리얼 상태를 `completed`로 저장

## 7. 컴포넌트 책임

### `TutorialProvider`

- 튜토리얼 상태와 현재 단계 관리
- 시작·다음·건너뛰기·완료·다시 보기 처리
- `localStorage` 저장과 복원
- 앱 상태 변화에 따른 단계 전환

### `TutorialOverlay`

- 배경 딤 처리
- 대상 요소의 화면 좌표 계산
- 대상 강조 테두리 표시
- 설명 패널 위치 조정
- 스크롤 및 리사이즈 시 위치 재계산

### `TutorialStep`

- 제목, 설명, 진행 표시 렌더링
- `다음`, `건너뛰기`, `닫기` 버튼 제공
- 대상 요소가 없을 때의 대체 안내 처리

### `TutorialLauncher`

- `내 기록` 화면 또는 공통 메뉴에 `튜토리얼 다시 보기` 제공
- 완료·건너뛰기 상태에서도 재실행 가능하게 처리

## 8. 통합 순서

1. 기준 테스트와 lint/build 실행
2. `tutorial-config.ts`에 단계 ID, 문구 키, 대상 속성 정의
3. `tutorial-storage.ts`에 버전 포함 저장·복원 구현
4. `TutorialProvider` 구현
5. `TutorialOverlay`와 `TutorialStep` 구현
6. `KTownApp`에 Provider를 배치하되 `MembershipProvider`와 `DemoSessionProvider`의 기존 경계를 유지
7. `ProfileSetup`과 `MembershipGate`에 첫 단계 대상 속성 추가
8. 추천 영토 카드, 지도 목록, `TacticalPanel`의 원정 버튼, 첫 체크인 버튼에 대상 속성 추가
9. 세션 상태 변화와 튜토리얼 단계를 연결
10. `AppShell` 또는 `RecordView`에 튜토리얼 다시 보기 추가
11. 한국어·영어 문구와 모바일 스타일 추가
12. 단위·통합 테스트 작성 및 실행
13. lint와 build 실행

## 9. 접근성·반응형 요구사항

- 오버레이는 `role="dialog"`, `aria-modal="true"`, `aria-describedby`를 사용한다.
- 튜토리얼 시작 시 설명 제목으로 포커스를 이동한다.
- `Escape`로 닫을 수 있어야 한다.
- 배경 UI는 튜토리얼 진행 중 클릭되지 않아야 한다.
- 키보드 사용자는 강조된 대상에 도달할 수 있어야 한다.
- 모바일에서는 설명 패널을 하단에 배치하고 주요 버튼을 가리지 않는다.
- 지도나 패널이 스크롤된 뒤에도 대상 요소 위치를 다시 계산한다.
- 대상 요소가 렌더링되지 않은 상태에서는 빈 오버레이를 표시하지 않고 해당 단계의 대체 안내를 표시한다.

기존 `useModalFocus`와 모달 스타일을 재사용할 수 있는지 먼저 확인해 중복 포커스 관리 구현을 피한다.

## 10. 테스트 계획

### 단위 테스트

- 초기 저장 상태가 없을 때 첫 단계가 시작되는지
- 완료·건너뛰기·다시 보기가 올바른 상태를 저장하는지
- 저장된 콘텐츠 버전이 현재 버전과 다를 때 정책대로 처리하는지
- 대상 요소가 없을 때 대체 안내가 표시되는지

### 통합 테스트

- 팬덤 선택 후 추천 영토 단계로 진행
- 추천 영토 선택 후 전술 패널 단계로 진행
- 원정 시작 후 체크인 단계로 진행
- 체크인 버튼 클릭 시 튜토리얼 완료
- 새로고침 후 완료 상태 유지
- 건너뛴 뒤에도 기존 앱을 정상 사용
- `튜토리얼 다시 보기`로 처음부터 재실행

기존 `team-preview-golden-path.test.tsx`의 실제 사용자 흐름과 충돌하지 않도록, 튜토리얼 테스트는 별도의 저장 키를 초기화하고 기존 골든 패스 테스트도 그대로 통과시키는 것을 기준으로 한다.

### 수동 브라우저 검증

- 데스크톱 1440px
- 모바일 390px
- 지도 설정 있음·없음
- 데모 모드·통합 모드
- 새로고침과 브라우저 뒤로 가기
- 위치 권한 허용·거부
- 체크인 모달이 열린 상태에서 튜토리얼 닫기

## 11. 완료 기준

- 신규 데모 사용자가 튜토리얼만 보고 첫 원정 화면에 진입할 수 있다.
- 통합 모드 사용자는 멤버십 선택 이후 튜토리얼 흐름이 깨지지 않는다.
- 튜토리얼을 건너뛰어도 기존 사이트 기능을 사용할 수 있다.
- 완료·건너뛰기 상태가 새로고침 후 유지된다.
- 튜토리얼 다시 보기로 언제든 재실행할 수 있다.
- 모바일에서 설명창과 주요 버튼이 겹치지 않는다.
- 한국어와 영어가 같은 단계 구조로 동작한다.
- 기존 테스트, lint, build가 모두 통과한다.
- 지도 설정이 없는 환경에서도 영토 목록으로 튜토리얼을 검증할 수 있다.

## 12. 구현 리스크와 대응

| 리스크 | 대응 |
| --- | --- |
| 지도 캔버스 내부 요소의 위치 계산이 불안정함 | 지도 자체 대신 접근 가능한 영토 목록 또는 요약 카드를 우선 대상화한다. |
| 통합 모드의 팬덤 선택과 데모 모드의 아티스트 선택이 다름 | 모드별 첫 단계 대상을 분리하고 공통 단계 ID는 유지한다. |
| 저장 상태가 기존 데모 초기화와 어긋남 | 튜토리얼 저장 키를 별도로 두고 `데모 초기화` 시 튜토리얼까지 지울지는 명시적으로 결정한다. MVP에서는 튜토리얼 완료 상태를 유지한다. |
| 모바일에서 설명 패널이 대상 버튼을 가림 | 하단 고정 패널과 스크롤 여백을 사용하고, 표시 전 대상 요소를 뷰포트 안으로 이동한다. |
| 체크인 권한 요청으로 사용자가 이탈함 | 튜토리얼은 체크인 진입까지만 완료 처리하고 권한 요청 이유를 체크인 화면에서 설명한다. |

## 13. 개발 완료 후 검증 명령

```powershell
Set-Location d:\compe\travel_data\web
npm test
npm run lint
npm run build
```

저장 위치: `docs/superpowers/plans/2026-09-16-tutorial-development-plan.md`