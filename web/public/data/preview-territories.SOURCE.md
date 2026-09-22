# Boundary provenance

`korea-outline.geojson` (the country) and `preview-territories.geojson` (the
23 preview territories) are both derived from one download of Statistics
Korea's administrative-dong boundaries. They are not hand-drawn.

## Source and terms

- Upstream: Statistics Korea SGIS (<https://sgis.kostat.go.kr>), released under
  **KOGL Type 1** (공공누리 제1유형, attribution):
  <https://www.kogl.or.kr/info/licenseType1.do>.
- Processed by [vuski/admdongkor](https://github.com/vuski/admdongkor) (history
  of dong changes applied, topology checked), whose data is **CC BY 4.0**.
- Exact file, pinned to commit `7360288`:
  <https://raw.githubusercontent.com/vuski/admdongkor/7360288277dfd12d74e54b959c59bdd66f852e3a/ver20260701/HangJeongDong_ver20260701.geojson>
  (3,558 dongs in 256 si/gun/gu, boundaries as of 2026-07-01, WGS84).
- Required attribution, kept on the map itself:

  > 본 데이터는 통계청 통계지리정보서비스(SGIS, https://sgis.kostat.go.kr)에서
  > 공공누리 제1유형으로 개방한 행정동 경계를 가공한 것이며(가공: vuski/admdongkor,
  > https://github.com/vuski/admdongkor), CC BY 4.0으로 배포됩니다.

## Why not geoBoundaries any more (2026-09-22)

The files used to come from geoBoundaries KOR ADM2 @9469f09. That download has
228 features and **no Yeonggwang-gun**, so a ~425 km² county on the Jeolla coast
was missing from the country and the base map's land showed through. Its
metropolitan cities were also far short of their real extent (Gwangju 123 km²
against ~501, Busan 349 against ~770, Incheon 264 against ~1,065), because
they had been rebuilt from whichever ADM2 pieces fell inside an older ADM1
shape.

## Build

Node.js 22 and mapshaper 0.6.113:

```sh
# Si/gun/gu from dongs; drop islets under 0.3 km², except Dokdo.
mapshaper HangJeongDong_ver20260701.geojson \
  -dissolve sgg copy-fields=sido -explode \
  -filter 'this.area > 300000 || this.bounds[0] > 131.8' -o s1.geojson

# Simplify everything but Dokdo, which `-simplify keep-shapes` still drops
# (and `-clean` removes as a sliver), then put it back untouched.
mapshaper s1.geojson -filter 'this.bounds[0] > 131.8' -o dokdo.geojson precision=0.0001
mapshaper s1.geojson -filter 'this.bounds[0] <= 131.8' \
  -dissolve sgg copy-fields=sido -simplify 10% keep-shapes -o main.geojson precision=0.0001
mapshaper -i main.geojson dokdo.geojson combine-files -merge-layers force \
  -dissolve sgg copy-fields=sido -o sgg.geojson precision=0.0001

# The country, and the territories, from that one simplified layer.
mapshaper sgg.geojson -dissolve -o korea-outline.geojson precision=0.0001
mapshaper sgg-tagged.geojson -dissolve id -o preview-territories.geojson precision=0.0001
```

`sgg-tagged.geojson` is `sgg.geojson` with each si/gun/gu given the preview id
from the table below and the rest dropped. Both outputs share the same
simplified arcs, so a territory's coast is exactly the country's coast. Feature
order and the `id` / `properties.id` shape of the previous file are kept.

## Territories

| Preview ID | SGIS source | Codes |
|---|---|---|
| seoul | 서울특별시 (whole sido) | `sido` 11 |
| busan | 부산광역시 (whole sido) | `sido` 26 |
| daegu | 대구광역시 (whole sido, Gunwi-gun included since 2023) | `sido` 27 |
| incheon | 인천광역시 (whole sido, islands included) | `sido` 28 |
| daejeon | 대전광역시 (whole sido) | `sido` 30 |
| ulsan | 울산광역시 (whole sido) | `sido` 31 |
| jeju | 제주특별자치도 (whole sido) | `sido` 50 |
| gwangju | the five former Gwangju gu, now in 전남광주통합특별시 | `sgg` 12210 12240 12270 12300 12330 |
| suwon | 수원시 (4 gu) | `sgg` 41111 41113 41115 41117 |
| seongnam | 성남시 (3 gu) | `sgg` 41131 41133 41135 |
| uijeongbu | 의정부시 | `sgg` 41150 |
| goyang | 고양시 (3 gu) | `sgg` 41281 41285 41287 |
| namyangju | 남양주시 | `sgg` 41360 |
| siheung | 시흥시 | `sgg` 41390 |
| gunpo | 군포시 | `sgg` 41410 |
| yongin | 용인시 (3 gu) | `sgg` 41461 41463 41465 |
| cheonan | 천안시 (2 gu) | `sgg` 44131 44133 |
| pohang | 포항시 (2 gu) | `sgg` 47111 47113 |
| gyeongju | 경주시 | `sgg` 47130 |
| geoje | 거제시 | `sgg` 48310 |
| chuncheon | 춘천시 | `sgg` 51110 |
| wonju | 원주시 | `sgg` 51130 |
| yeongwol | 영월군 | `sgg` 51750 |
