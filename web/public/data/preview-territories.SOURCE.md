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

## Rebuild from ADM2 alone (2026-09-20)

Clipping could not fix the coast. The regions above came from two downloads at
once, and ADM1 (Natural Earth) and ADM2 (citypopulation.de) draw the same
shoreline at different fidelities, so a metropolitan region cut against an
outline built from the other provider kept leaving slivers — Pohang's was still
visible after three attempts.

Both files are now derived from **ADM2 only**, the one pinned download
`geoBoundaries-KOR-ADM2.geojson` at revision `9469f09`:

- `korea-outline.geojson` is the union of all 228 ADM2 features.
- `preview-territories.geojson` rebuilds each of the 23 territories as the union
  of the ADM2 pieces lying at least half inside its previous polygon — so the
  eight metropolitan territories that used to be single ADM1 features are now
  their own districts merged (`seoul` 24, `busan` 13, `daegu` 7, `incheon` 5,
  `ulsan` 5, `daejeon` 4, `jeju` 2, `gwangju` 1), and the ADM2-sourced
  territories are unchanged apart from rounding.

Because every edge now comes from one provider, a region's coast *is* the
national coast: measured area outside the outline is 0.0000% for all 23,
Incheon included. Coordinates are rounded to the four decimal places the file
already used. The table above still records which source feature named each
territory; the ADM1 rows describe that naming, not the current geometry.

## Yeonggwang-gun filled in (2026-09-22)

The pinned ADM2 download has 228 features and **Yeonggwang-gun (영광군) is not
one of them**, so the outline unioned from it left a ~425 km² notch on the
Jeolla coast between Gochang and Hampyeong, where the base map's own land
showed through.

`korea-outline.geojson` now fills that notch with the one piece of the ADM1
(Natural Earth) country that the ADM2 union does not cover there:

```sh
mapshaper adm1.geojson -dissolve -erase korea-outline.geojson -explode \
  -each 'a=this.area/1e6' -filter 'a>400'          # → yeonggwang.json
mapshaper -i korea-outline.geojson yeonggwang.json combine-files \
  -merge-layers force -dissolve2 -o precision=0.0001
```

Its inland edges are the ADM2 neighbours' own, so it joins without a seam
(polygon and hole counts are unchanged); only its coast is ADM1's coarser
line. Every other ADM1-only piece is a coastal sliver about 1 km wide, or the
strip up to the DMZ, and was left as it was. No preview territory changes.
