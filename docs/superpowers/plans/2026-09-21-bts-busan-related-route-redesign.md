# BTS 부산 고정 앵커·선택 추천 코스 재설계 계획

기준 커밋: `origin/main@0565811` (`merge: ship integrated expedition backend`)

## 1. 목표와 불변조건

`routeKey=bts-busan` 코스에는 다음 두 장소가 항상 이 순서로 존재한다.

1. 부산아시아드주경기장
2. 감천문화마을

두 장소는 필수 앵커다. 추천지는 앵커 앞·사이·뒤에 배치되는 선택 정류장이며, 추천지를 선택하거나 체크인하지 않아도 두 앵커를 승인 체크인하면 원정이 완료된다. 시작된 원정의 정류장 목록, 순서, 필수 여부, 추천 근거는 외부 API 및 캐시 갱신과 무관하게 고정된다.

기존 지역 추천 API와 기존 클라이언트는 깨지지 않아야 한다. `routeKey`가 없는 요청은 현재 `main`의 일반 지역 추천 동작을 유지한다.

## 2. 현재 `main`에서 확인된 제약

- 추천 응답과 프론트 계약은 `routeItems`가 아니라 `stops`를 사용한다.
- `GET /api/v1/expeditions/recommended`와 `POST /api/v1/expeditions`의 `limit`은 3~5이며, 일반 추천기는 후보가 3개 미만이면 404를 반환한다.
- 원정 시작 시 서버가 추천을 다시 계산하고 `recommendationId`만 비교한다.
- `ExpeditionApplication.finish()`와 `CheckInApplication._complete_expedition_stop()`은 모든 저장 정류장의 완료를 요구한다.
- 통합 화면은 `allStopsCheckedIn`으로 모든 정류장을 완료 조건으로 보고, 종료 버튼은 활성 원정을 완료시키지 않고 `abandon`한다.
- `PlaceModel`은 이미 `content_id`, `discovery_keywords`, `homepage_url`, `source`, `source_operations`를 제공하므로 앵커 별칭·공식 출처 때문에 장소 스키마를 추가할 필요는 없다.
- 최신 Alembic revision은 `20260921_0011`이다. 새 revision은 `20260921_0012`로 만든다.

## 3. 범위와 비범위

### 포함

- `bts-busan` 고정 앵커 시드 및 코스 조합기
- 관광지별 연관 관광지 API와 국문 관광정보 서비스의 서버 측 결합
- 기존 `stops` 계약의 하위 호환 확장
- 선택 추천지의 원정 시작 시점 영속화
- 필수 정류장만을 사용한 완료 판정
- 통합 화면의 추천 추가·제외, 출처 표시, 새로고침 복구
- 캐시·장애 격리·결정성·마이그레이션·회귀 테스트

### 제외

- 일반 지역 추천 알고리즘 전면 교체
- 도로망 또는 실시간 교통 기반 경로 최적화
- 숙박형 원정
- 시작된 원정의 정류장 편집
- 추천지만으로 원정을 완료하는 기능

## 4. 데이터와 앵커 관리

### 4.1 앵커 설정

코드에 버전 관리되는 `RouteDefinition`을 둔다.

```text
route_key: bts-busan
algorithm_version: bts-busan-v1
anchors:
  - content_id: operator:bts-busan-asiad
    order: 1
  - content_id: operator:busan-gamcheon
    order: 2
```

`seed_demo_places()`를 일반화한 멱등 시드에서 두 `PlaceModel`을 upsert한다.

- `source="operator"`, `is_public=true`, `is_active=true`
- 공식 명칭, 검증된 좌표·주소
- `discovery_keywords`: 띄어쓰기 변형과 검색 별칭
- `homepage_url`: 지자체 또는 공식 관광 출처
- `source_operations=["operator_verified_anchor"]`

시드는 `content_id`로 갱신하며 UUID를 외부 계약으로 사용하지 않는다. API 검색 실패가 앵커 값을 덮어쓰지 못하게 한다.

구현에 사용할 seed fixture는 현재 `main`의 검증된 미리보기 데이터를 그대로 승격한다. 좌표계는 WGS84(EPSG:4326), 검증 기준일은 2026-09-21이다.

| 필드 | 부산아시아드주경기장 | 감천문화마을 |
|---|---|---|
| `content_id` | `operator:bts-busan-asiad` | `operator:busan-gamcheon` |
| 공식 명칭 | 부산아시아드주경기장 | 감천문화마을 |
| 주소 | 부산광역시 연제구 월드컵대로 344 | 부산광역시 사하구 감내1로 200 |
| 위도, 경도 | `35.1901, 129.0584` | `35.0977, 129.0104` |
| 별칭 | 부산아시아드경기장, 부산아시아드주경기장, 부산아시아드 주경기장 | 감천문화마을, 감천 문화마을, 부산 감천문화마을 |
| 공식 URL | `https://www.busan.go.kr/stadium/sfintro` | `https://saha.go.kr/portalEn/contents.do?mId=0201000000` |

부산아시아드의 BTS 관계 근거는 기존 `main`의 Weverse 공지와 Visit Busan 출처를 UI 콘텐츠 근거로 유지하되, 장소 자체의 `homepage_url`은 부산시 시설 페이지를 사용한다.

### 4.2 추천 후보의 DB 자격

추천 후보는 `PlaceModel`에 존재하는 `source="KTOUR_API"`, `is_public=true`, `is_active=true`, 부산 `region_code="6"` 장소만 허용한다. 외부 응답은 후보를 새로 공개하는 용도가 아니라 기존 공식 카탈로그 장소의 순위·근거를 보강하는 용도로만 사용한다.

- 연관 API 결과는 국문 관광정보 API의 키워드 검색으로 `contentid`를 해소한다.
- 해소한 `contentid`가 현재 공개 카탈로그에 없으면 v1 응답에서 제외하고 로그에 원인만 남긴다.
- 위치기반 결과도 `contentid`로 현재 카탈로그와 교차한다.
- GET 추천 요청은 DB를 쓰지 않는다. 새 장소 유입은 기존 카탈로그 동기화 작업이 담당한다.

## 5. 외부 API와 장애 정책

### 5.1 이식 범위

`feature/related-attractions` 전체를 병합하거나 현재 dirty 작업을 WIP 커밋하지 않는다.

- 커밋 `49aba0b`, `564fb1c`에서 `ktour_related.py`, 설정, 단위 테스트를 선별 이식한다.
- 현재 작업 트리의 위치기반 조회 개선은 patch로 따로 보존한 뒤 `KTourOpenAPIClient`의 키워드·위치 호출과 테스트만 수동 이식한다.
- 과거 `/nearby-attractions` 화면 계약과 장소별 프론트 호출은 이식하지 않는다. 추천 조합은 서버의 코스 단위 서비스 한 곳에서 수행한다.

### 5.2 기준월과 캐시

- 설정: `KTOUR_RELATED_BASE_YM`, v1 기본값은 기존 관련 관광지 브랜치에서 검증된 `202504`로 고정한다. 운영자가 월을 변경할 때는 staging의 두 앵커 응답·빈 결과 fallback 테스트를 통과한 뒤 환경변수와 배포 changelog를 함께 변경한다.
- 호출 순서: 설정 월부터 과거 방향으로 최대 3개월, 첫 비어 있지 않은 월에서 중지한다.
- 성공 캐시 TTL 24시간, 빈 결과·실패 캐시 TTL 1시간.
- 키: `(routeKey, algorithmVersion, anchorContentId, baseYm, sourceOperation)`.
- 같은 키의 동시 요청은 단일 실행으로 합친다.
- 마지막 성공 월은 프로세스 캐시에 함께 보관하되 설정 또는 알고리즘 버전 변경 시 무효화한다.
- 프로세스 재시작 후 재탐색은 허용한다. 현재 production의 단일 API 서비스 전제를 문서화하고 다중 replica 전환 전 공유 캐시를 별도 과제로 둔다.

### 5.3 호출 상한과 다중 관측 병합

| 목적 | operation | 고정 파라미터와 상한 |
|---|---|---|
| 연관 후보 | `TarRlteTarService1/searchKeyword1` | 앵커별 별칭을 표 순서로 시도, `areaCd=26`, 경기장 `signguCd=26470`, 감천 `signguCd=26380`, `numOfRows=20`, `pageNo=1`, 월별 최대 3회 |
| 연관 후보 보조 | `TarRlteTarService1/areaBasedList1` | keyword 결과가 없을 때만 같은 지역·시군구·월, `numOfRows=100`, `pageNo=1`; 정규화한 중심 관광지 이름이 앵커 별칭과 정확히 같은 행만 사용 |
| content ID 해소 | `KorService2/searchKeyword2` | 추천 이름을 Unicode NFKC 정규화한 원문으로 1회, `areaCode=6`, `numOfRows=50`, `pageNo=1`, `arrange=A`; 정규화 이름이 정확히 일치하는 결과만 허용 |
| 위치 후보 | `KorService2/locationBasedList2` | 앵커별 반경 5,000m, `numOfRows=50`, `pageNo=1`, `arrange=S`; 5km 결과가 0개여도 반경을 확대하지 않음 |

키워드 해소에서 정확히 일치하는 결과가 여러 개면 `region_code=6 → 앵커와 가까운 거리 → content_id 오름차순`으로 하나를 고른다. 모든 operation은 최대 1페이지만 읽는다.

요청 하나의 논리 호출 상한은 related keyword 6회(2앵커×3개월), area fallback 2회(각 앵커에서 3개월 keyword가 모두 빈 경우 최신 설정 월로 1회), content ID 해소 8회, location 2회로 총 18회다. 해소 대상 이름은 다중 관측을 먼저 합친 뒤 `related rank → baseYm 내림차순 → 앵커 order → 정규화 이름` 순으로 상위 8개만 사용한다. 재시도를 포함한 실제 HTTP 시도는 요청당 총 24회를 넘지 않는다.

같은 content ID가 여러 앵커·월·소스에서 관측되면 하나로 축약한다.

- `sources`: 중복을 제거한 뒤 enum 문자열 오름차순
- `relatedRank`: 관련 관측의 최솟값
- 대표 관련 관측: `rank 오름차순 → baseYm 내림차순 → 앵커 order 오름차순`
- 대표 위치 관측: `앵커와의 거리 오름차순 → 앵커 order 오름차순`
- related와 location이 함께 있으면 related를 대표 근거로 쓰고 location은 metadata의 보조 source로만 보존
- 마지막 동점 키는 항상 `content_id 오름차순`

### 5.4 시간 제한과 실패 격리

- 외부 호출 1회 타임아웃 3초, 최대 2회 시도, 재시도 간격 200ms.
- 두 소스는 가능한 범위에서 병렬 조회하며 추천 요청의 외부 조회 총 예산은 5초다.
- 단계 순서는 related 수집 → content ID 해소와 location 병렬 실행이다. monotonic clock 기준 5초 hard deadline에 도달하면 새 작업과 재시도를 시작하지 않고 실행 중 task를 취소한다. 취소 완료를 최대 100ms 기다린 뒤 그때까지 확보·검증된 결과만으로 응답한다.
- 연관 API 실패: 위치기반 후보만 사용한다.
- 위치기반 API 실패: 연관 후보 중 DB 해소가 끝난 항목만 사용한다.
- 모두 실패 또는 후보 0개: HTTP 200과 앵커 2개만 반환한다.
- 키, 원본 응답 본문, 내부 예외는 브라우저에 반환하지 않는다.

## 6. 결정적 필터·배치·점수 알고리즘

모든 거리는 WGS84 좌표의 Haversine 직선거리(km)로 계산하고 소수점 반올림 전 값으로 비교한다.

### 6.1 필터와 중복 제거

다음 후보를 제외한다.

- 두 앵커와 동일한 `content_id`
- 좌표·이름·`content_id`가 없는 장소
- `region_code != "6"`
- 허용 content type이 아닌 장소: 관광지 12, 문화시설 14, 축제 15, 레포츠 28, 쇼핑 38, 음식점 39
- 숙박 32 및 여행코스 25
- 앵커 A 또는 B 중 가까운 곳에서도 5km를 초과하는 장소

중복은 다음 순서로 판정한다.

1. 동일 `content_id`
2. Unicode NFKC 후 공백·문장부호 제거 및 casefold한 이름이 동일
3. 좌표 간 100m 이하이면서 content type이 동일

중복 승자는 `연관 API 근거 > 위치기반 근거 > 콘텐츠 완성도 > content_id 오름차순`으로 고른다.

### 6.2 배치

앵커 A→B를 지역 평면 좌표로 투영하고 후보 C의 선분 투영계수 `t`와 다음 비용을 계산한다.

```text
betweenDetour = distance(A,C) + distance(C,B) - distance(A,B)
beforeCost = 2 * distance(A,C)
afterCost = 2 * distance(B,C)
```

- `0 <= t <= 1`이고 `betweenDetour <= 5km`: `between`
- 그 외이며 `distance(A,C) <= 3km`: `before`
- 그 외이며 `distance(B,C) <= 3km`: `after`
- 어느 조건도 만족하지 않으면 제외
- before와 after가 동시에 가능한 경우 더 가까운 앵커를 선택하고, 거리가 같으면 `before`를 선택한다.

앵커는 항상 `placement=main`이다. 최종 순서는 `before → A → between → B → after`이며 같은 placement 안에서는 아래 점수 순서를 사용한다.

### 6.3 점수

```text
relatedRankScore = max(0, 21 - min(rank, 21)) / 20
routeScore = max(0, 1 - placementCost / placementLimit)
contentScore = present(image, address, category, description) / 4
diversityScore = 1 if 아직 선택되지 않은 content type else 0
```

- `placementCost`: between은 `betweenDetour`, before/after는 각각 `beforeCost`/`afterCost`
- `placementLimit`: between 5km, before/after 6km
- 연관 후보: `0.45*relatedRankScore + 0.30*routeScore + 0.15*contentScore + 0.10*diversityScore`
- 위치기반 후보: 연관 점수 항을 0으로 두어 최대 점수를 0.55로 제한한다.

선택 과정은 점수 내림차순으로 한 항목씩 진행하며 다양성 점수는 선택할 때마다 다시 계산한다. 완전 동점은 `근거 우선순위 → placementCost 오름차순 → content_id 오름차순`으로 해소한다.

placement별 최대치는 before 1, between 2, after 1이며 전체 추천 노출은 상위 3개다. v1의 모든 추천은 `selectedByDefault=false`로 반환한다.

기존 `limit`은 **앵커를 포함한 전체 stop 상한**으로 유지한다. 따라서 BTS 추천 개수 상한은 `min(3, limit - 2)`이며 `limit=3/4/5`일 때 각각 최대 `1/2/3`개다. 추천 후보가 없어 실제 stop 수가 limit보다 작아지는 것은 정상이다.

## 7. API 계약: 기존 `stops`의 additive 확장

`routeItems`로 이름을 바꾸지 않는다. 기존 필드를 유지하고 다음 필드를 추가한다.

```json
{
  "id": "digest",
  "routeKey": "bts-busan",
  "routeVersion": "bts-busan-v1:<catalogSnapshot>:<relatedYm>",
  "stops": [
    {
      "order": 1,
      "kind": "anchor",
      "placement": "main",
      "required": true,
      "selectedByDefault": true,
      "distanceKm": 0,
      "reasons": ["필수 메인 관광지"],
      "place": {},
      "evidence": null
    },
    {
      "order": 2,
      "kind": "recommendation",
      "placement": "between",
      "required": false,
      "selectedByDefault": false,
      "distanceKm": 1.2,
      "reasons": ["방문 데이터 기반", "우회 1.2km"],
      "place": {},
      "evidence": {
        "source": "KTOUR_RELATED_ATTRACTION",
        "reason": "실제 방문 데이터 기반 연관 관광지",
        "relatedRank": 3,
        "baseYm": "202504",
        "sources": ["KTOUR_LOCATION_BASED", "KTOUR_RELATED_ATTRACTION"],
        "auxiliaryObservations": [
          {
            "source": "KTOUR_LOCATION_BASED",
            "anchorContentId": "operator:bts-busan-asiad",
            "distanceKm": 1.2,
            "baseYm": null,
            "relatedRank": null
          }
        ]
      }
    }
  ]
}
```

`routeKey`가 없는 기존 일반 추천 응답에도 새 stop 필드를 직렬화하되 `kind=anchor`, `required=true`, `placement=main`, `selectedByDefault=true`로 둬 기존의 "모든 장소가 필수" 의미를 보존한다. 여기서 anchor는 고정 BTS 앵커가 아니라 해당 원정의 필수 메인 정류장이라는 API 의미다.

`recommendationId`는 알고리즘 버전, routeVersion, 순서가 확정된 전체 stop의 content ID·kind·placement·required·근거를 canonical JSON으로 만든 SHA-256 digest다. 입력 후보의 원래 순서나 Python 객체 직렬화 순서가 digest에 영향을 주지 않아야 한다.

`routeVersion`은 다음 값으로 고정한다.

```text
bts-busan-v1:<catalogSnapshot>:<relatedState>
```

- `catalogSnapshot`: 가장 최근 성공한 부산 `CatalogSyncRunModel.snapshot_version`. 없으면 활성 공개 부산 후보의 `(content_id, source_modified_at 또는 synced_at 또는 "none")`을 content ID로 정렬한 canonical JSON SHA-256 앞 16자.
- `relatedState`: 반환되는 추천 stop에 기여한 관련 관측 중 `rank 오름차순 → baseYm 내림차순 → 앵커 order 오름차순 → content_id 오름차순` 첫 관측의 `baseYm`. 필터 후 기여 관측이 0개이고 관련 논리 호출이 하나라도 정상 완료되었으면 `RELATED_NONE`, 모든 관련 호출이 실패·timeout·취소되었으면 `RELATED_UNAVAILABLE`.
- 위치기반 성공 여부는 후보 목록과 recommendation digest에 반영되며 `relatedState` 의미를 바꾸지 않는다.

`evidence.sources`는 정렬된 source enum 배열이고 `auxiliaryObservations`는 위 예시 필드만 갖는 배열이다. 배열은 `source → anchorContentId → baseYm(null은 마지막) → relatedRank(null은 마지막) → distanceKm` 순으로 정렬한다. 같은 객체를 `recommendation_metadata` JSONB에 저장하고 응답에 그대로 직렬화한다. canonical recommendation digest에는 사람이 읽는 `reason`을 포함한 evidence 객체 전체를 key 정렬·공백 없는 JSON으로 포함한다.

원정 시작 요청에는 선택 결과를 추가한다.

```json
{
  "recommendationId": "digest",
  "routeKey": "bts-busan",
  "routeVersion": "...",
  "selectedRecommendationPlaceIds": ["uuid"],
  "regionCode": "6",
  "travelDate": "2026-09-21",
  "limit": 5
}
```

서버는 같은 입력으로 코스를 다시 조합하고 `recommendationId`와 `routeVersion`을 모두 비교한다. 변경되었으면 기존 `409 EXPEDITION_RECOMMENDATION_CHANGED`를 반환하며 다른 코스를 묵시적으로 저장하지 않는다. 선택 ID는 해당 응답의 선택 추천 부분집합이어야 하며 앵커 ID는 클라이언트 입력과 관계없이 서버가 항상 추가한다.

하위 호환과 입력 오류 계약은 다음과 같다.

- `routeKey`가 없으면 `routeVersion`과 `selectedRecommendationPlaceIds`도 선택 사항이며 현재 `recommendationId` 재계산 경로를 그대로 사용한다.
- `routeKey=bts-busan`이면 `routeVersion`과 선택 배열이 필수다. 추천을 하나도 고르지 않은 경우 빈 배열을 보낸다.
- `routeKey`는 strict string을 trim한 뒤 길이 1~64, 정규식 `[a-z0-9]+(?:-[a-z0-9]+)*`를 적용한다. `routeVersion`은 trim하지 않는 strict string, 길이 1~200, 정규식 `[A-Za-z0-9:._-]+`를 적용한다.
- 지원하지 않는 routeKey는 `404 ROUTE_NOT_SUPPORTED`.
- 선택 배열은 UUID 문자열, 중복 없음, 최대 3개다. 타입·중복·개수 위반은 FastAPI `422`.
- 현재 추천의 부분집합이 아니거나 anchor ID가 포함되면 `409 EXPEDITION_SELECTION_INVALID`.
- 동일 recommendationId로 이미 활성 원정이 있으면 현재 idempotent 응답을 유지하되 저장된 선택 집합이 요청과 다르면 `409 ACTIVE_EXPEDITION_EXISTS`.

`bts-busan`은 후보 부족 시에도 앵커 2개로 성공하므로 `limit>=3` 일반 규칙을 내부 조합기에 적용하지 않는다. 공개 query/body의 기존 `limit=3..5` 계약은 유지해 구클라이언트를 깨지 않는다.

## 8. 영속 모델과 마이그레이션

`20260921_0012_route_stop_semantics.py`에서 `expedition_stops`에 추가한다.

- `stop_kind VARCHAR(20) NOT NULL`
- `is_required BOOLEAN NOT NULL`
- `placement VARCHAR(20) NOT NULL`
- `recommendation_source VARCHAR(40) NULL`
- `recommendation_reason TEXT NULL`
- `recommendation_metadata JSONB NOT NULL DEFAULT '{}'`

제약:

- `stop_kind IN ('anchor','recommendation')`
- `placement IN ('before','main','between','after')`
- anchor이면 `is_required=true`, `placement='main'`, 추천 출처는 null
- recommendation이면 `is_required=false`

기존 행은 현재 의미를 보존하기 위해 `stop_kind='anchor'`, `is_required=true`, `placement='main'`으로 백필한다. downgrade는 새 제약과 컬럼만 제거하며 기존 원정·체크인 데이터는 유지한다.

`ExpeditionModel`에는 `route_key VARCHAR(64) NULL`과 `route_version VARCHAR(200) NULL`을 추가한다. 기존 원정은 null로 유지한다.

원정 생성은 한 트랜잭션에서 앵커 2개와 사용자가 선택한 추천지만 저장한다. 추천 응답에 있었지만 선택되지 않은 장소는 저장하지 않는다.

미리보기 응답의 추천지는 `selectedByDefault=false`지만, 저장 응답에 존재하는 모든 정류장은 이미 선택된 코스이므로 `selectedByDefault=true`로 직렬화한다.

upgrade는 PostgreSQL의 단일 Alembic 트랜잭션 안에서 다음 순서를 지킨다.

1. 새 컬럼을 nullable로 추가한다.
2. 기존 `expedition_stops`를 명시적 UPDATE로 백필한다.
3. null 행 개수가 0인지 SQL 검증하고 남아 있으면 migration을 실패시킨다.
4. `stop_kind='anchor'`, `is_required=true`, `placement='main'`, `recommendation_metadata='{}'` server default를 설정하고 해당 컬럼을 NOT NULL로 변경한다.
5. CHECK 제약을 추가한다.
6. `expeditions.route_key`, `route_version` nullable 컬럼을 추가한다.

PostgreSQL transactional DDL이므로 중간 실패는 revision 전체를 rollback한다. 재실행은 `alembic current`가 `0011`인지 확인한 뒤 원인을 해결하고 `alembic upgrade head`를 다시 수행한다. revision row만 수동 조작하지 않는다. 테스트는 각 단계에 고의 실패를 주입해 rollback 후 재upgrade를 확인한다.

0012의 server default는 구버전 애플리케이션이 일반 원정 정류장을 계속 INSERT할 수 있게 롤백 관찰 기간 동안 유지한다. 새 애플리케이션 배포 후 최소 24시간 동안 구버전 롤백이 없고 모든 writer가 새 필드를 쓰는 것을 확인한 뒤 별도 `0013_remove_route_stop_defaults` revision으로 default만 제거한다. 0012 적용 상태에서 구버전 바이너리의 일반 원정 생성과 새 버전의 BTS 원정 생성을 둘 다 검증한다.

## 9. 완료·체크인 상태 전환

### 서버

- `ExpeditionApplication.finish(..., "completed")`의 미완료 개수 쿼리에 `is_required=true`를 추가한다.
- `CheckInApplication._complete_expedition_stop()`의 자동 완료 쿼리도 `is_required=true`만 센다.
- 추천 정류장 체크인은 기존 점수 정책을 그대로 사용하지만 원정 완료 여부에는 영향을 주지 않는다.
- 이미 완료된 원정에서 뒤늦은 추천지 체크인을 허용하지 않는다. 원정 완료 전에 선택 추천지를 방문하면 추가 점수를 받는다.

### 프론트

- `LiveExpeditionStop`에 `kind`, `placement`, `required`, `selectedByDefault`, `evidence`를 추가한다.
- `liveMissionPlaces()`가 이 메타데이터를 화면 모델로 전달한다.
- 추천 선택 상태는 시작 전 컴포넌트 state로 관리하고 시작 성공 후에는 서버의 `PersistedExpedition.stops`만 신뢰한다.
- 통합 모드의 완료 가능 여부는 `liveExpedition.stops.filter(required)`의 `completedAt`으로 계산한다.
- 체크인 승인 후 `services.expeditions.current()`를 다시 읽어 서버의 자동 완료 상태와 정류장 완료 시간을 반영한다.
- 종료 버튼은 필수 정류장이 모두 끝났으면 `complete()`, 아니면 명시적 확인 후 `abandon()`을 호출한다. 현재처럼 항상 abandon하지 않는다.
- 로컬 데모의 `deriveCompletedExpeditionIds`는 정적 2개 앵커 경로를 유지한다. 향후 데모 추천 정류장을 넣을 때 사용할 `requiredStopIds` 도우미를 별도로 추가해 서버 의미와 이름을 맞춘다.

## 10. 화면 UX

- 앵커 카드는 기존 체크인 카드와 동일한 주요 계층을 유지하고 `필수` 배지를 표시한다.
- 추천 카드는 `선택` 배지, before/between/after 문구, 거리, 카테고리, 이미지, 근거를 표시한다.
- 연관 API 근거는 `방문 데이터 기반`, 위치기반은 `동선 주변 추천`으로만 표시한다.
- 추천 후보에는 `코스에 추가`, 선택된 후보에는 `코스에서 제외`를 제공한다.
- 원정 시작 뒤에는 추가·제외 버튼을 숨기고 저장된 코스를 표시한다.
- 외부 API 장애로 추천이 없으면 오류 화면 대신 앵커 2개와 `현재는 선택 추천지가 없습니다`를 표시한다.
- 키보드 포커스, 버튼 접근 이름, 한국어·영어 문구, 모바일 360px 레이아웃을 테스트한다.

## 11. 구현 순서와 파일 단위 작업

0. **기준선 판정**
   - manifest에 `origin/main` SHA, Python·web·build 명령, exit code, 실패 test ID와 오류 요약을 기록
   - 현재 관찰된 Python 예외: `tests/integration/test_migrations.py::test_upgrade_downgrade_and_reupgrade_manage_the_mvp_schema` 1건
   - 현재 관찰된 web 예외: assertion 376개는 통과했으나 focus/scroll 관련 unhandled error 9건으로 exit 1
   - 전용 빈 test DB와 web test 단독 실행으로 재현 여부를 확인한다. 재현되면 feature와 분리된 선행 fix 커밋으로 해결하고, 재현되지 않으면 환경 원인과 깨끗한 재실행 증거를 manifest에 남긴다.
   - 기준선 명령이 모두 exit 0이 되기 전에는 기능 구현과 production 배포를 시작하지 않는다.
1. **기준선과 이식 준비**
   - `origin/main@0565811` 기반 `codex/` 브랜치와 분리 워크트리 사용
   - 원래 dirty 작업은 staged `git diff --cached --binary`, unstaged `git diff --binary`, untracked 파일 **내용** archive를 각각 별도 경로에 보존
   - 세 산출물의 SHA-256과 `git status --porcelain=v2`를 기록하고 임시 clone에서 복원 검증한 뒤에만 이식 시작
   - 관련 API 어댑터와 테스트만 선별 이식
2. **앵커와 코스 도메인**
   - `seed_demo.py`, 신규 route definition, `related_attractions.py`, `expedition_recommendation.py`
   - 순수 함수 필터·중복·배치·점수 테스트 먼저 작성
3. **API additive 확장**
   - `api/expedition_routes.py`, 설정, 앱 초기화
   - 일반 추천 응답 호환 테스트와 BTS 2앵커 폴백 테스트
4. **영속화와 완료 판정**
   - model, revision 0012, `expedition_application.py`, `checkin_application.py`
   - migration 및 원정 lifecycle 통합 테스트
5. **프론트 계약과 화면**
   - `web/lib/domain.ts`, `http-services.ts`, gateway, expedition adapter
   - territory/start flow, expedition view, 완료/포기 분기
6. **전체 회귀·실브라우저·배포**
   - 아래 검증 행렬 수행 후 커밋, push, production 배포
   - 배포 후 health, 추천, 시작, 체크인, 완료 스모크 테스트

각 단계는 독립 커밋으로 만들며 실패 시 해당 커밋을 revert할 수 있게 한다. DB revision 배포 뒤 애플리케이션 롤백 가능성을 위해 새 컬럼은 구버전 코드가 무시할 수 있는 additive 변경으로 먼저 배포하고, 컬럼 제거 downgrade는 애플리케이션 롤백 확인 후에만 수행한다.

## 12. 검증 행렬

### 단위 테스트

- 앵커가 항상 A→B 순서인지
- 이름·content ID·100m 좌표 중복 제거
- 배치 경계 `t=0`, `t=1`, 우회 5km, 앵커 거리 3km
- 연관 후보가 동일 조건의 위치 후보보다 우선하는지
- 고정 random seed로 입력 순서를 무작위로 바꿔 100회 실행해 결과가 동일한지
- 기준월 3개월 탐색, 성공/빈 결과 TTL, 동시 요청 병합, fake clock 만료
- malformed API 항목과 타임아웃 격리
- 관련 논리 호출 18회, 실제 시도 24회, content ID 해소 8개 상한
- 5초 deadline에서 신규 작업·재시도 중지, 실행 task 취소, 확보 결과만 반환
- 혼합 월·부분 실패·필터 후 관련 후보 0개에 대한 relatedState

### API·계약 테스트

- 일반 추천의 기존 `stops` 필드와 시작 요청이 그대로 동작
- `bts-busan` 정상: 앵커 2개 + 추천 최대 3개
- 한 API 실패, 두 API 실패, 후보 0개 모두 200
- 두 API 실패 응답은 정확히 앵커 2개
- 변조된 선택 ID와 오래된 routeVersion은 409
- routeKey 없는 legacy 시작, unknown routeKey 404, 누락된 BTS routeVersion 422
- 선택 배열의 빈 값, 중복, 비UUID, 4개, anchor 포함, 추천에 없는 UUID
- routeKey와 routeVersion의 wrong type, empty, whitespace-only, oversized, 잘못된 패턴
- `limit=3/4/5`에서 전체 stop 상한과 추천 상한이 각각 유지됨
- 선택하지 않은 추천지는 저장되지 않음
- API 키와 원본 오류가 응답에 없음

### DB·lifecycle 테스트

- revision 0011→0012 upgrade, 기존 정류장 백필, downgrade
- 0012 뒤 구버전 writer INSERT, 새 버전 writer INSERT, 0013 default 제거
- migration 중간 실패 rollback과 `upgrade head` 재실행
- 메인 0/2, 1/2, 2/2 체크인 상태
- 추천지만 체크인해도 완료되지 않음
- 메인 2개만 체크인하면 추천 미완료 상태에서도 자동 완료
- 수동 complete도 필수 정류장만 검사
- 시작된 원정은 외부 API/캐시 변경 뒤에도 정류장과 근거가 동일
- 체크인·점수 idempotency와 원정 소유권 검증 유지

### 프론트 테스트

- 추가/제외와 시작 payload
- 추천 출처 두 종류의 문구 구분
- 새로고침 후 저장된 선택 코스 복구
- 필수 2곳 완료 시 완료 버튼 및 `complete()` 호출
- 필수 미완료 시 포기 확인 및 `abandon()` 호출
- 튜토리얼 practice 체크인이 실제 원정·점수에 반영되지 않음
- 기존 통합 체크인, 팬덤, 영토, 기록 화면 회귀

### 실브라우저·배포 후 관찰

1. 부산 BTS 원정을 열어 두 앵커 순서와 추천 배치를 확인한다.
2. 추천 하나를 추가하고 시작한 뒤 새로고침해 같은 코스가 복구되는지 확인한다.
3. 추천지는 방문하지 않고 두 앵커만 승인 체크인해 완료되는지 확인한다.
4. 외부 API를 차단한 환경에서 앵커 2개로 시작 가능한지 확인한다.
5. DB에서 저장 stop 순서, `is_required`, 출처, 완료 시각을 확인한다.
6. `/health/ready`, 추천 API, 현재 원정 API와 서버 로그의 secret 비노출을 확인한다.

## 13. 완료 기준

- `bts-busan`의 두 앵커가 모든 정상·장애 응답에 존재하고 순서가 변하지 않는다.
- 추천지는 최대 3개이며 before/between/after 중 하나로 결정적으로 배치된다.
- 연관 데이터와 위치기반 근거가 API와 화면에서 구분된다.
- 사용자가 선택한 추천지만 원정 시작 시 저장되고 새로고침 후 유지된다.
- 추천지를 선택했어도 두 앵커만 완료하면 원정이 완료된다.
- 추천지만 체크인해서는 완료되지 않는다.
- 기존 일반 추천, 체크인, 점수, 튜토리얼, 영토, 원정 복구 계약이 통과한다.
- 두 외부 API 장애 시에도 HTTP 200으로 앵커 2개를 반환하고 시작할 수 있다.
- 캐시와 동시 요청 병합 테스트로 외부 호출량이 통제된다.
- baseline manifest의 Python 전체 테스트, web 전체 테스트, production build가 모두 exit 0이며 신규 실패가 0개다.
- migration, 실브라우저 시나리오와 배포 후 스모크 테스트가 모두 통과한다.

## 14. 롤백

- 화면 문제: 새 stop 필드를 무시하고 앵커만 보여 주는 feature flag로 즉시 비활성화한다.
- 외부 API 문제: 추천 조합을 끄고 앵커 2개 폴백을 유지한다.
- 애플리케이션 문제: 단계별 커밋을 역순 revert한다. 0012의 server default가 남아 있는 동안 additive DB 컬럼은 구버전 writer와 호환된다.
- 데이터 문제: 시작된 원정은 snapshot이므로 수정하지 않는다. 새 원정 생성만 중단한다.
- migration downgrade는 새 코드가 완전히 내려간 뒤 수행하며, 기존 정류장 데이터는 삭제하지 않는다.
