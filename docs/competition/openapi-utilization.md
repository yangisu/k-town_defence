# 2026 관광데이터 활용 공모전 OpenAPI 활용·검증서

## 1. 서비스에서 쓰는 관광데이터

K-Town Defense는 K-콘텐츠 팬의 관심 키워드를 부산의 실제 관광지·음식점·행사로 연결해 3~5개 정거장 원정을 만들고, 선택한 장소에서 GPS·사진 체크인을 시작한다. 브라우저 요청 때 외부 API를 호출하지 않고, 서버가 국문 관광정보 서비스(KorService2)를 주기적으로 호출해 PostgreSQL의 마지막 정상 스냅샷을 갱신한다.

| OpenAPI 작업 | 제품 기능 | 저장·표시 결과 |
|---|---|---|
| `areaBasedSyncList2` | 변경 관광지 탐지 | 변경 콘텐츠 ID와 증분 동기화 근거 |
| `areaBasedList2` | 부산 후보 수집 | 명칭, 주소, 좌표, 분류, 대표 이미지 |
| `searchKeyword2` | K-콘텐츠 관심지 탐색 | `BTS`, `K-POP` 등 발견 키워드와 추천 시작점 |
| `locationBasedList2` | 시작점 주변 확장 | 5km 내 지역 정거장 후보 |
| `detailCommon2` | 장소 공통 상세 | 개요, 홈페이지, 전화, 상세 이미지 |
| `detailIntro2` | 유형별 이용 정보 | 이용시간, 쉬는 날, 주차 |
| `detailInfo2` | 반복 상세 정보 | 메뉴·시설 등 유형별 상세 목록 |
| `detailImage2` | 관광 이미지 보강 | HTTPS 원본 이미지 목록 |
| `searchFestival2` | 여행일 행사 연결 | 행사 시작·종료일과 활성 행사 추천 |

추천은 키워드 일치, 이동거리, 카테고리 다양성, 여행일 행사, 방문 기록이 적은 장소를 결정적으로 조합한다. 각 정거장에는 `키워드 일치`, `다른 유형의 지역 명소`, `여행일에 열리는 행사` 같은 설명 가능한 이유가 함께 반환된다.

## 2. 필요한 API 키

필요한 키는 공공데이터포털에서 **한국관광공사 국문 관광정보 서비스_GW(KorService2)** 활용신청 후 발급되는 일반 인증키 하나다. 별도의 작업별 키는 필요하지 않다.

- 서버 환경변수: `KTOUR_SERVICE_KEY`
- 선택 설정: `KTOUR_MOBILE_APP`(기본 `KTownDefense`), `KTOUR_MOBILE_OS`(기본 `ETC`)
- 키·신청자 정보는 `.env`와 공식 출품 신청서에만 둔다.
- 키, 전체 요청 URL, 쿼리 문자열, 원문 응답은 DB·로그·Git·공개 API에 저장하지 않는다.

`.env` 예시:

```dotenv
KTOUR_SERVICE_KEY=공공데이터포털에서_발급된_일반_인증키
KTOUR_MOBILE_APP=KTownDefense
KTOUR_MOBILE_OS=ETC
DATABASE_URL=postgresql+asyncpg://ktown:ktown@127.0.0.1:55432/ktown
```

## 3. 부산 실데이터 동기화

저장소 루트 PowerShell에서 실행한다.

```powershell
docker compose up -d postgres
.\.venv\Scripts\python.exe -m alembic -c alembic.ini upgrade head
.\.venv\Scripts\python.exe -m ktown_defense.sync_expeditions --area-code 6 --keyword BTS --keyword K-POP --days 30 --limit 100 --force-full
```

성공 JSON에는 실행 ID, 상태, 수집 건수, 활성 건수만 출력된다. 실패 또는 빈 스냅샷이면 기존 정상 관광지를 유지한다. 재실행은 동일 `contentId` 행을 갱신하므로 장소 UUID와 체크인 참조가 안정적으로 유지된다.

개발계정은 일일 호출량이 제한되므로 100건 전체 동기화를 불필요하게 반복하지 않는다. 심사·운영 전에는 공공데이터포털에 활용사례를 등록하고 운영계정 트래픽 증설을 신청한다. 2026년 8월 실연동 확인 결과, 현행 `detailImage2`는 `imageYN=Y`를 사용하고 폐기된 `subImageYN` 파라미터를 보내지 않아야 한다. 공식 이미지 호스트가 HTTP URL을 반환하면 HTTPS 지원을 확인한 해당 호스트만 HTTPS로 승격하고 그 외 HTTP 이미지는 폐기한다.

## 4. 심사용 안전 증빙

아래 쿼리는 비밀값 없이 실제 서버 호출 이력과 기능별 성공 건수를 증명한다.

```sql
SELECT
  r.id AS sync_run_id,
  r.status AS run_status,
  r.area_code,
  r.fetched_count,
  r.active_count,
  l.operation,
  l.feature,
  l.status AS call_status,
  l.response_count,
  l.error_code,
  l.completed_at
FROM catalog_sync_runs AS r
JOIN open_api_call_logs AS l ON l.sync_run_id = r.id
WHERE r.source = 'KTOUR_API'
ORDER BY r.started_at DESC, l.completed_at, l.operation;
```

공개 증빙 API:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/v1/open-data/status | ConvertTo-Json -Depth 5
```

응답에는 `관광 OpenAPI` 라벨, 활성 장소 수, 최근 갱신 시각, 연동 작업별 최근 성공 시각·응답 건수만 포함한다. 인증키, 요청 URL, 신청자 정보, 원문 응답은 포함하지 않는다.

## 5. 심사 시연 순서

1. 첫 화면에서 팬덤을 선택한다.
2. 탐색 화면의 `부산 로컬 원정`과 최신 데이터 시각, 연동 기능·건수를 확인한다.
3. `BTS` 또는 `K-POP` 키워드로 원정을 다시 만든다.
4. 서로 다른 유형의 3개 이상 정거장과 정거장별 추천 이유를 보여준다.
5. 실제 관광 상세(주소, 이용시간, 쉬는 날, 주차, 이미지)를 확인한다.
6. 한 정거장의 `현장 체크인`을 선택하고 GPS와 사진을 제출한다.
7. PostgreSQL에 체크인 세션이 저장되고 판정 대기 상태가 되는 것을 보여준다.
8. `/api/v1/open-data/status` 또는 위 안전 SQL로 실제 OpenAPI 활용 이력을 제시한다.

로컬 통합 시연은 `.env.local`의 `KTOWN_DEV_USER_ID`가 적용되는 `npm run dev`를 사용한다. production 빌드는 호스팅 플랫폼이 전달하는 `oai-authenticated-user-id`만 신뢰하므로 배포 전에 Sites 인증 연결이 필요하다.

공개 서비스 화면·메타데이터에는 주최 기관명, 약칭, 로고를 노출하지 않고 `관광 OpenAPI`, `공공 관광데이터` 표현만 사용한다. 기관명과 인증키는 공식 제출 양식의 지정 필드에서만 제공한다.

## 6. 재현 검증

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests
.\.venv\Scripts\python.exe -m pytest tests/api tests/integration tests/e2e -q
Set-Location web
npm test -- --run
npm run lint
npm run build
```

핵심 수직 테스트 `tests/e2e/test_expedition_vertical.py`는 추천 응답의 실제 장소 UUID를 체크인 생성 API로 넘긴 뒤 새 DB 세션에서 해당 체크인 행을 확인한다.
