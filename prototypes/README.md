# 연관 관광지 추천 독립 프로토타입

애플리케이션 API와 화면에 연결되지 않은 실험용 CLI입니다. 다음 두 공공 API를
호출합니다.

- 관광지별 연관 관광지 정보: 기준 관광지가 데이터셋에 있을 때 연관 순위 후보 생성
- 국문 관광정보 서비스 GW: 관광지 식별, 좌표·이미지 보강, 위치기반 후보 보완

루트 `.env`에 `KTOUR_SERVICE_KEY`를 설정한 뒤 저장소 루트에서 실행합니다.

```powershell
.\.venv\Scripts\python.exe -m prototypes.related_tourism_recommender `
  부산아시아드주경기장 감천문화마을 --limit 3
```

JSON 출력은 `--json`을 추가합니다.

```powershell
.\.venv\Scripts\python.exe -m prototypes.related_tourism_recommender `
  감천문화마을 --limit 3 --json
```

연관 관광지 데이터는 `2024-05`부터 `2025-04`까지의 역사 데이터이며 모든 관광지가
기준 관광지로 포함되지는 않습니다. 입력 장소가 기준 관광지로 조회되지 않으면
국문 관광정보의 `locationBasedList2`를 이용해 반경 5km 관광지를 추천하고, 결과가
없을 때만 반경을 10km로 확장합니다. 표시 거리는 경로 거리가 아닌 직선거리입니다.
