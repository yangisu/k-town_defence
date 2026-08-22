# Preview territory boundary provenance

`preview-territories.geojson` is a derived cartographic subset of the
geoBoundaries Republic of Korea open boundary downloads. It is not hand-drawn
or inferred from the preview centroids.

## Sources and redistribution terms

- Retrieved: **2026-08-22**.
- Dataset/API publisher: [geoBoundaries](https://www.geoboundaries.org/).
- ADM1 metadata:
  <https://www.geoboundaries.org/api/current/gbOpen/KOR/ADM1/>. The record
  identifies the upstream source as Natural Earth and the boundary license as
  **Public Domain**; its license link is
  <https://www.naturalearthdata.com/about/terms-of-use/>.
- Exact ADM1 download used (pinned geoBoundaries revision `9469f09`):
  <https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/KOR/ADM1/geoBoundaries-KOR-ADM1.geojson>.
- ADM2 metadata:
  <https://www.geoboundaries.org/api/current/gbOpen/KOR/ADM2/>. The record
  identifies the upstream source as citypopulation.de and the boundary license
  as **Creative Commons Attribution 3.0**; its license link is
  <https://www.citypopulation.de/en/help/termsofuse/>.
- Exact ADM2 download used (pinned geoBoundaries revision `9469f09`):
  <https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/KOR/ADM2/geoBoundaries-KOR-ADM2.geojson>.
- geoBoundaries describes its open downloads as CC BY 4.0 and requests visible
  attribution on web products. The preview therefore displays a persistent
  `geoBoundaries` attribution link and retains this provenance file. See
  <https://www.geoboundaries.org/index.html#getdata>.

These terms permit redistribution with the stated attribution. Metropolitan
preview territories use the corresponding ADM1 feature; municipal and county
territories use ADM2. `jeju` intentionally represents the ADM1 Jeju boundary,
matching the preview territory name rather than only Jeju-si.

## Extraction and simplification

The output was generated with Node.js 24.18.1 and mapshaper 0.6.113. In the
command below, `$mapping` is the JavaScript object shown by the table in the
next section, expressed as `{ "source shapeName": "preview id", ... }`.

```powershell
$adm1 = "geoBoundaries-KOR-ADM1.geojson"
$adm2 = "geoBoundaries-KOR-ADM2.geojson"
$lookup = '({"Busan":"busan","Daegu":"daegu","Gwangju":"gwangju","Daejeon":"daejeon","Seoul":"seoul","Incheon":"incheon","Jeju":"jeju","Ulsan":"ulsan","Gunpo-si":"gunpo","Seongnam-si":"seongnam","Geoje-si":"geoje","Suwon-si":"suwon","Gyeongju-si":"gyeongju","Yongin-si":"yongin","Goyang-si":"goyang","Siheung-si":"siheung","Cheonan-si":"cheonan","Pohang-si":"pohang","Wonju-si":"wonju","Chuncheon-si":"chuncheon","Uijeongbu-si":"uijeongbu","Namyangju-si":"namyangju","Yeongwol-gun":"yeongwol"})[shapeName]'
npx --yes mapshaper@0.6.113 $adm1 $adm2 combine-files `
  -merge-layers `
  -filter "$lookup !== undefined" `
  -each "id=$lookup" `
  -filter-fields id `
  -simplify 12% keep-shapes `
  -clean `
  -o preview-territories.geojson format=geojson id-field=id precision=0.0001
```

The command retained 23 of 245 input features, retained all 23 shapes after
simplification/cleaning, removed one geometry sliver, and wrote only the preview
ID property. Every output feature has that value both as its GeoJSON feature
`id` and as `properties.id`.

## Included source features and preview IDs

| Preview ID | Source `shapeName` | Level | Source `shapeID` |
|---|---|---|---|
| busan | Busan | ADM1 | 68945753B18996591190839 |
| daegu | Daegu | ADM1 | 68945753B94077674833362 |
| gwangju | Gwangju | ADM1 | 68945753B46109248456415 |
| gunpo | Gunpo-si | ADM2 | 91817680B51138241033746 |
| seongnam | Seongnam-si | ADM2 | 91817680B94836834309250 |
| geoje | Geoje-si | ADM2 | 91817680B58127051569150 |
| suwon | Suwon-si | ADM2 | 91817680B43312282385471 |
| gyeongju | Gyeongju-si | ADM2 | 91817680B5353031397212 |
| daejeon | Daejeon | ADM1 | 68945753B85435209225479 |
| seoul | Seoul | ADM1 | 68945753B55100681051852 |
| yongin | Yongin-si | ADM2 | 91817680B86612267469181 |
| goyang | Goyang-si | ADM2 | 91817680B27371207272645 |
| incheon | Incheon | ADM1 | 68945753B50642023031709 |
| jeju | Jeju | ADM1 | 68945753B53856725499604 |
| ulsan | Ulsan | ADM1 | 68945753B85001375391280 |
| siheung | Siheung-si | ADM2 | 91817680B37911583032119 |
| cheonan | Cheonan-si | ADM2 | 91817680B50780672353800 |
| pohang | Pohang-si | ADM2 | 91817680B48442195707238 |
| wonju | Wonju-si | ADM2 | 91817680B41990583973423 |
| chuncheon | Chuncheon-si | ADM2 | 91817680B67839742247787 |
| uijeongbu | Uijeongbu-si | ADM2 | 91817680B6871011244235 |
| namyangju | Namyangju-si | ADM2 | 91817680B38772026787440 |
| yeongwol | Yeongwol-gun | ADM2 | 91817680B79863718076959 |
