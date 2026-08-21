# K-Town Defense

## 한국관광공사 OpenAPI 설정

PlaceCatalog 동기화는 한국관광공사 **국문 관광정보 서비스_GW
(KorService2)** 의 `searchKeyword2`와 `detailCommon2`를 실제 호출한다.

1. [공공데이터포털의 국문 관광정보 서비스](https://www.data.go.kr/data/15101578/openapi.do)에 활용신청한다.
2. 발급된 일반 인증키(Encoding 또는 Decoding 키 모두 지원)를 소스가 아닌 환경변수에 설정한다.

PowerShell 예시:

```powershell
$env:KTOUR_SERVICE_KEY = "발급받은-서비스-키"
$env:KTOUR_MOBILE_APP = "KTownDefense"
```

동기화 호출 예시:

```python
from ktown_defense import CatalogSyncService, KTourKeywordQuery

queries = [
    KTourKeywordQuery(
        artist_id="artist-a",
        keyword="방탄소년단",
        transit_guide_ko="운영자가 검증한 한국어 대중교통 안내",
        place_type="official",
    )
]

run = catalog_sync_service.sync_from_ktour(queries)
if run.status != "succeeded":
    # 기존 마지막 정상 스냅샷은 최대 24시간 유지된다.
    raise RuntimeError("한국관광공사 관광 데이터 동기화 실패")
```

관광지 ID·한국어 명칭·주소·좌표·지역코드·상세 설명은 OpenAPI 응답을
사용한다. 아티스트 검색어와 정적 교통 안내는 서비스 운영자가 검증해
설정하며, 서비스 키는 스냅샷 및 증빙 URI에 저장하지 않는다.

테스트:

```powershell
python -m unittest discover -s tests -v
```

## 통합 MVP 로컬 실행

Python 3.13+, Node.js 22.13+, Docker Desktop이 필요하다. 실제 비밀값은
`.env`에만 두고 커밋하지 않는다.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[test]"
docker compose up -d postgres
.\.venv\Scripts\python.exe -m alembic -c alembic.ini upgrade head
.\.venv\Scripts\python.exe -m ktown_defense.seed_demo
.\.venv\Scripts\python.exe -m uvicorn ktown_defense.api.main:app --port 8000
```

다른 터미널에서 웹을 실행한다.

```powershell
Set-Location web
npm ci
$env:KTOWN_SERVICE_MODE = "integrated"
$env:KTOWN_API_BASE_URL = "http://127.0.0.1:8000"
$env:KTOWN_DEV_USER_ID = "local-member"
npm run dev -- --port 3000
```

`KTOWN_DEV_USER_ID`는 로컬 개발 서버에서만 사용된다. production에서는
Sites가 전달한 `oai-authenticated-user-id`만 신뢰한다.

통합 MVP API는 `GET /api/v1/places`와 장소 상세, 체크인 생성, GPS·사진
메타데이터 저장, 멱등 제출을 제공한다. 제출 결과는 승인이나 포인트 지급이
아닌 `pending`이다. 실제 사진 바이너리 저장, 심사, 포인트와 거점 갱신은
후속 범위다.

전체 검증:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
.\.venv\Scripts\python.exe -m pytest tests/api tests/integration tests/e2e -q
Set-Location web
npm test
npm run lint
npm run build
```
