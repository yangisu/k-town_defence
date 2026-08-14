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
