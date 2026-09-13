# EC2 독립 운영 배포

## 구조

인터넷 트래픽은 Caddy의 80/443 포트만 받는다. Caddy는 자동으로 TLS 인증서를
발급·갱신하고 모든 애플리케이션 요청을 Node 웹 서버로 보낸다. 웹 서버의
서버 측 API 라우트가 FastAPI를 호출하며 PostgreSQL과 FastAPI 포트는 Docker
내부 네트워크에만 존재한다.

## 최초 배포

1. 가비아 DNS에서 루트 도메인 `ktowndefense.site`의 `A` 레코드를 EC2 탄력적
   IP `3.35.84.75`로 지정하고, `www`는 `ktowndefense.site`를 가리키는 CNAME으로
   설정한다. Caddy가 `www` 요청을 루트 도메인으로 영구 리디렉션한다.
2. EC2 보안 그룹에서 TCP 80/443을 공개하고, SSH 22는 관리자 IP로 제한한다.
   기존 TCP 3306 공개 규칙은 삭제한다. PostgreSQL 5432도 공개하지 않는다.
3. Ubuntu에 Docker Engine과 Compose 플러그인을 설치하고 저장소를 복제한다.
4. `.env.production.example`을 `.env.production`으로 복사한 뒤 실제 비밀값을
   입력한다. 이 파일은 Git에 커밋하지 않는다.
5. 다음 명령으로 빌드하고 시작한다.

```bash
docker compose --env-file .env.production -f compose.production.yaml up -d --build
docker compose --env-file .env.production -f compose.production.yaml ps
curl -fsS https://${SITE_DOMAIN}/healthz
```

새 인스턴스는 `AmazonSSMManagedInstanceCore` 정책만 가진 EC2 역할을 연결한 뒤
Systems Manager Run Command에서 다음 명령으로 최초 구성을 자동화할 수 있다.

```bash
curl -fsSL https://raw.githubusercontent.com/yangisu/k-town_defence/feat/self-hosted-production/deploy/bootstrap-ec2.sh \
  | bash
```

스크립트는 확장된 EBS 루트 파일시스템 반영, 512MB 빌드용 스왑, Docker, 비공개 운영 비밀값,
기본 nginx 중지, 컨테이너 기동과 공개 HTTPS 헬스체크를 구성한다. 실제 관광·지도·SNS 키는 이후
`/opt/ktown-defense/.env.production`에 넣고 스택을 다시 기동한다.

API 컨테이너는 시작 전에 Alembic 마이그레이션을 실행한다. DB와 업로드 사진은
각각 `postgres_data`, `private_uploads` 볼륨에 남기 때문에 컨테이너 교체 후에도
유지된다.

## DataGrip 연결

DB 포트를 공개하지 않는다. DataGrip 연결이 필요할 때만 다음처럼 DB 포트를
EC2의 루프백 주소에 바인딩한다.

```bash
docker compose --env-file .env.production \
  -f compose.production.yaml -f compose.admin.yaml up -d database
```

DataGrip의 SSH 터널 호스트는 EC2, 데이터베이스 호스트는 `127.0.0.1`, 포트는
`55432`로 지정한다. 이 포트는 EC2 외부 인터페이스에서는 열리지 않는다. 일반
운영 점검은 EC2에서 `docker compose exec database psql`을 사용하는 것이
기본이며, 인터넷 전체에 5432나 3306을 공개해서는 안 된다.

## 운영 점검

```bash
docker compose --env-file .env.production -f compose.production.yaml logs --tail=200
docker compose --env-file .env.production -f compose.production.yaml exec database \
  pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"
curl -fsS https://${SITE_DOMAIN}/healthz
```

정기 EBS 스냅샷과 `pg_dump`의 별도 S3 보관을 설정한다. 업로드 사진에는 위치
정보가 포함될 수 있으므로 공개 디렉터리로 서빙하지 않으며, 보존기간 삭제와
EXIF 제거 작업을 운영 전 추가해야 한다.
