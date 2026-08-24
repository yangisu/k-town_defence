# K-Town Defense Web

## Runtime modes

- `KTOWN_SERVICE_MODE=demo`: 외부 백엔드 없이 기존 fixture로 실행한다.
- `KTOWN_SERVICE_MODE=integrated`: 같은 출처 `/api/ktown/*` 게이트웨이를
  통해 FastAPI의 장소·체크인 API를 사용한다.

`KTOWN_API_BASE_URL`과 신뢰된 사용자 헤더는 서버에서만 사용하며 브라우저
번들에 노출하지 않는다. 로컬 `npm run dev`에서는 `KTOWN_DEV_USER_ID`로
개발 사용자를 지정할 수 있지만 production에서는 이 값을 무시하고 Sites의
`oai-authenticated-user-id`만 전달한다.

로컬 통합 모드는 `.env.local`을 직접 만들고 `KTOWN_SERVICE_MODE=integrated`,
`KTOWN_API_BASE_URL`, `KTOWN_DEV_USER_ID`를 로컬 값으로 설정한다. `.env.local`은
Git에서 제외되며 vinext가 개발 서버 시작 시 자동으로 읽는다. 배포용
`.env.example`을 통합 모드 파일로 사용하지 않는다.

## Vercel demo deployment

AWS 백엔드 연결 전에는 프론트엔드만 데모 모드로 배포한다. Vercel Dashboard의
**Add New → Project**에서 `yangisu/k-town_defence` 저장소를 가져오고 다음 값을
사용한다.

- Root Directory: `web`
- Framework Preset: `Nitro`
- Build Command: `npm run build:vercel` (`vercel.json`이 지정)
- Output Directory: override를 켜지 않는다. Nitro가 Vercel Build Output API
  규격의 `.vercel/output`을 생성한다.
- Environment Variables: Preview와 Production 모두 `web/.env.example`의
  다음 네 값을 각각 등록한다.

```dotenv
KTOWN_SERVICE_MODE=demo
NEXT_PUBLIC_AWS_LOCATION_API_KEY=example-restricted-map-key
NEXT_PUBLIC_AWS_LOCATION_REGION=ap-northeast-2
NEXT_PUBLIC_AWS_LOCATION_STYLE=Standard
```

`example-restricted-map-key`는 실제 키로 교체하되, 이 키는 브라우저에서 보이는
공개 자격증명이다. AWS Location API key의 **map actions**를 이 앱이 사용하는
`geo-maps:GetStyleDescriptor`, `geo-maps:GetTile`, `geo-maps:GetSprites`,
`geo-maps:GetGlyphs`로만 제한하고 Places, Routes, Trackers 등의 권한은 부여하지
않는다. 또한 AWS Client restrictions에 아래 HTTPS referrer를 개별 등록한다.

- Preview origin/referrer: 배포마다 Vercel이 표시한 정확한
  `https://<preview-host>.vercel.app/*`
- Production origin/referrer: 실제 운영 주소인
  `https://<production-host>/*`

> **경고:** unrestricted key나 `*.vercel.app/*`처럼 다른 프로젝트까지 허용하는
> 광범위한 referrer를 사용하지 않는다. Preview와 Production 주소가 바뀌면 새
> 정확한 주소를 먼저 등록하고 이전 주소는 제거한다. 키 제한을 저장한 뒤 두
> 배포에서 실제 지도의 타일·확대/축소·이동을 확인한다.

`KTOWN_API_BASE_URL`, `KTOWN_DEV_USER_ID`, `KTOUR_SERVICE_KEY`, 데이터베이스
URL은 이 단계의 Vercel 환경변수에 추가하지 않는다. 이 값들은 브라우저 공개
변수가 아니며 `NEXT_PUBLIC_` 접두사를 사용하지 않는다. 로컬 연결 정보가 있는
`.env.local`과 Vercel이 생성하는 `.vercel/`도 Git에 커밋하지 않는다.

저장소에서 Vercel 산출물을 미리 확인하려면 다음을 실행한다.

```bash
npm ci
npm run build:vercel
```

성공하면 `.vercel/output/config.json`, 정적 자산, `__server.func`가 생성된다.
산출물 경계 검사에서 config와 브라우저 정적 자산은 서버 전용 식별자와 데이터베이스
URL을 모두 거부하고, app-owned chunk는 로컬 origin도 거부한다.
`KTOWN_API_BASE_URL` 식별자는 통합 모드의
same-origin gateway가 런타임에 읽어야 하므로 `__server.func`에만 허용하지만,
실제 값이나 `localhost`/IPv4/IPv6 loopback 기본값은 어느 app-owned chunk에도
고정하지 않는다. Vinext framework chunk가 URL 파싱을 위해 포함하는 일반
`http://localhost` 문자열은 앱 설정이 아니므로, 값 sentinel과 private 식별자는
전체 산출물에서 검사하고 local-origin literal은 app-owned chunk에서 검사한다.
Git 연동은 PR/브랜치 push에 Preview를 만들고 `main` push에 Production 배포를
만든다. 첫 배포에서는 Preview URL에서 다음을 확인한 후 Production으로
승격한다.

1. `/`가 HTTPS 200으로 열리는지 확인한다.
2. Amazon Location 지도를 확대/축소하고 이동한 뒤 영토 목록에서 같은 지역이
   선택되는지 확인한다.
3. BTS를 검색·선택하고 추천 원정을 연다.
4. 데모 인증, 로컬 소비, 포인트 검토, 체크인 제출을 차례로 실행한다.
5. 영토·랭킹·내 기록에 같은 결과가 반영되고 새로고침 뒤에도 남는지 확인한다.
6. **Reset demo**를 눌러 확인 창에서 초기화하고 3단계 시작 패널이 돌아오는지
   확인한다. 이 작업은 이 브라우저의 K-Town 데모 세션만 지운다.

지도 화면과 설정 안내에는 `Map © Amazon Location · Boundaries © geoBoundaries`
attribution을 항상 표시한다. 지도 스타일·타일은 Amazon Location에서 오지만,
프리뷰의 체크인 승인, 포인트 계산, territory battle updates, 그리고 Korea
Tourism data는 심사용으로 고정된 **deterministic demo behavior**다. 실제 GPS,
카메라, 결제, 한국관광공사 API 또는 운영 백엔드를 호출하지 않으며 데모 결과를
실서비스 승인으로 해석하지 않는다.

### Personalized demo contract

- 선택한 fandom은 이 브라우저의 데모 프로필로 저장되며, 확인한 프로필과 체크인
  진행 상황은 새로고침 뒤에도 유지된다. **Reset demo**만 이 전용 세션을 지운다.
- 공공 관광지만 포함한 route는 `지역 응원 원정`으로 표시하며 artist 이름이나
  직접 연관 branding을 붙이지 않는다. Artist-linked route는 검증된 연결 근거가
  있는 경우에만 별도로 표시한다.
- 지도 영토는 현재 owner의 고정 color를 사용한다. Stronghold stage는 색을 바꾸지
  않고 marker diameter로만 구분하며 씨앗 14px, 나무 22px, 랜드마크 32px이다.

커밋에는 예시 키만 둔다. 제한한 실제 키가 제공되지 않은 환경에서는 빌드와
접근 가능한 영토 목록까지 검증하고, Preview/Production 실지도 smoke verification은
외부 확인 항목으로 남긴다.

AWS API가 준비된 뒤에만 `KTOWN_SERVICE_MODE=integrated`와 서버 전용
`KTOWN_API_BASE_URL`을 설정한다. 그 전에 Vercel 사용자 세션을 검증해 FastAPI의
신뢰 헤더로 변환하는 인증 어댑터가 필요하다. `KTOWN_DEV_USER_ID`는 production
인증 대체 수단으로 사용하지 않는다.

통합 체크인은 브라우저 위치 권한으로 GPS를 세 번 수집하고 카메라 또는
갤러리에서 선택한 사진 바이너리를 비공개 백엔드에 업로드한다. 위치 권한은
localhost 또는 HTTPS에서만 정상 동작한다. 원본 사진은 현재 EXIF를 제거하지
않으므로 민감한 촬영정보가 포함된 사진은 사용하지 않는다. 제출은
`pending`이며 승인과 포인트 지급은 구현되지 않았다.

`integrated` 모드에서는 팬덤 목록과 현재 시즌 멤버십도 같은 게이트웨이로
조회한다. 멤버십이 없으면 접근 가능한 팬덤 선택 화면을 먼저 표시하고, 선택이
DB에 저장된 뒤 실시간 부산 관광지 화면을 연다. `demo` 모드는 인스턴스별
메모리 멤버십으로 동일한 화면 흐름을 체험할 수 있다.

## Original vinext runtime notes

A clean full-stack starter running on
[vinext](https://github.com/cloudflare/vinext), with optional Cloudflare D1 and
Drizzle support.

## Prerequisites

- Node.js `>=22.13.0`

## Quick Start

```bash
npm install
npm run dev
npm run build
```

This starter does not use `wrangler.jsonc`.

## Included Shape

- edit site code under `app/`
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/schema.ts` starts intentionally empty
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

Signed-in visitors receive both `oai-authenticated-user-id` and `oai-authenticated-user-email`. Private Sites require every visitor to sign in; public Sites may also have anonymous visitors, for whom neither header is present.

The user ID is stable for the same user on the same Site and different across Sites. Email and name are intended for display or contact purposes.

SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty
`name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const userId = requestHeaders.get("oai-authenticated-user-id");
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs
optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send
  anonymous visitors through Sign in with ChatGPT.
- Use `chatGPTSignInPath(returnTo)` and `chatGPTSignOutPath(returnTo)` for
  browser links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in
  or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because
  they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the
OAuth cookies, and identity header injection. Do not implement app routes for
those reserved paths. Routes that do not import and call the helper remain
anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the
Sites hosting platform's access policy controls for workspace-wide restrictions,
or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write
actions tied to the current ChatGPT user. Leave public content anonymous.

## Useful Commands

- `npm run dev`: start local development
- `npm run build`: verify the vinext build output
- `npm test`: build the starter and verify its rendered loading skeleton
- `npm run db:generate`: generate Drizzle migrations after schema changes

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
