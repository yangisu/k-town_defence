# K-Town Defense 통합 MVP 설계

**작성일:** 2026-08-21  
**상태:** 승인됨  
**범위:** 기존 Python 도메인과 vinext 웹을 하나의 모노레포로 통합하고, FastAPI·PostgreSQL·Alembic을 사용해 장소 조회부터 체크인 제출 영속화까지 실제로 동작하는 첫 세로형 MVP를 만든다.

## 1. 목표

사용자가 웹에서 공개 장소를 조회하고 체크인 세션을 시작한 뒤 GPS와 사진 메타데이터를 제출하면, 모든 상태가 PostgreSQL에 저장되고 새로고침과 서버 재시작 후에도 동일하게 조회되어야 한다. 기존 인메모리 도메인 규칙과 102개 회귀 테스트는 유지한다.

이번 범위의 완료 조건은 다음과 같다.

- `web/`이 루트 Git에 포함되고 별도 Git 저장소가 아니다.
- FastAPI 애플리케이션이 `/health`와 버전이 지정된 장소·체크인 API를 제공한다.
- Alembic이 빈 PostgreSQL 데이터베이스를 현재 스키마로 올릴 수 있다.
- 장소와 체크인 상태가 PostgreSQL에 영속된다.
- 웹은 통합 모드에서 실제 API를 사용하고 데모 모드에서는 기존 fixture를 계속 사용할 수 있다.
- 브라우저에서 시작한 체크인이 FastAPI를 거쳐 PostgreSQL에 저장되는 흐름을 자동 테스트한다.

## 2. 범위 밖

다음 기능은 이번 세로형 MVP에서 구현하지 않는다.

- 완전한 팬덤 가입·변경·잠금 정책
- 운영자 장소 승인 UI와 관광공사 정기 동기화 작업
- 실제 사진 바이너리 업로드와 객체 스토리지
- 자동·수동 체크인 심사 워크플로
- 포인트 워커, 거점 갱신, 리그, 미션, 추천, 분석
- 운영 배포와 고가용성 구성

기존 화면의 배틀과 여행 기록은 데모 데이터임을 명시하고 유지한다.

## 3. 저장소 통합

`web/.git`은 삭제하지 않고 루트 `.git/` 아래의 백업 디렉터리로 이동한다. 이동 전후 경로를 절대 경로로 검증하고, 백업이 존재하는지 확인한 뒤에만 루트 Git에 `web/` 파일을 추가한다. `web/node_modules`, 빌드 결과, Wrangler 로그와 로컬 데이터베이스 파일은 루트 `.gitignore`에서 제외한다.

현재 사용자가 수정한 문서, 압축 파일, 루트 브랜치 상태는 변경하거나 정리하지 않는다. 커밋은 이번 작업의 파일만 명시적으로 stage한다.

## 4. 런타임 구조

```text
Browser
  -> vinext server-side gateway
      -> FastAPI /api/v1
          -> application services
              -> SQLAlchemy repositories
                  -> PostgreSQL
```

Python 패키지는 `src/ktown_defense`를 유지한다. 새 코드는 다음 책임으로 분리한다.

- `settings.py`: 환경변수와 데이터베이스 URL
- `api/main.py`: FastAPI 애플리케이션 팩토리와 라우터 조립
- `api/dependencies.py`: 요청별 DB 세션과 신뢰된 사용자 식별자
- `api/errors.py`: 안정적인 오류 응답
- `api/place_routes.py`: 공개 장소 조회
- `api/checkin_routes.py`: 체크인 세션·증거·제출 API
- `infrastructure/database.py`: SQLAlchemy 엔진과 세션 팩토리
- `infrastructure/models.py`: 장소와 체크인 ORM 모델
- `infrastructure/repositories.py`: 영속성 연산
- `checkin_application.py`: 체크인 유스케이스와 기존 도메인 규칙 연결

## 5. 데이터 모델

모든 식별자는 애플리케이션에서 생성한 UUID를 사용하고, 시각은 UTC timezone-aware 값으로 저장한다.

### places

- `id`: UUID 기본 키
- `content_id`: 관광공사 콘텐츠 ID, nullable, unique
- `name_ko`: 한국어 이름
- `address_ko`: 한국어 주소
- `latitude`, `longitude`: 좌표
- `region_code`: 관광공사 지역 코드
- `description_ko`: 한국어 설명
- `is_public`, `is_active`: 공개 및 체크인 가능 상태
- `synced_at`, `created_at`, `updated_at`: UTC 시각

### checkin_sessions

- `id`: UUID 기본 키
- `user_id`: 신뢰된 게이트웨이 사용자 식별자
- `place_id`: 장소 외래 키
- `status`: `collecting`, `ready`, `submitted`, `expired`, `cancelled`
- `expires_at`, `created_at`, `updated_at`: UTC 시각

한 사용자가 같은 장소에 여러 기록을 가질 수 있지만, 활성 세션 중복 생성 요청에는 기존 활성 세션을 반환한다.

### checkin_gps_samples

- `id`: UUID 기본 키
- `session_id`: 체크인 세션 외래 키
- `sequence`: 세션 내 단조 증가 순번
- `latitude`, `longitude`, `accuracy_meters`
- `captured_at`, `received_at`: UTC 시각

`(session_id, sequence)`는 unique다.

### checkin_photos

- `id`: UUID 기본 키
- `session_id`: 체크인 세션 외래 키
- `storage_key`: 향후 비공개 객체 스토리지 키
- `content_type`, `size_bytes`, `sha256`
- `captured_at`, `created_at`: UTC 시각

이번 범위에서는 브라우저가 사진 바이너리를 보내지 않고, 서버가 검증한 업로드 완료 메타데이터를 저장한다. 실제 바이너리 업로드는 후속 범위다.

### checkin_submissions

- `id`: UUID 기본 키
- `session_id`: unique 외래 키
- `idempotency_key`: UUID-v4, unique
- `decision`: `pending`
- `submitted_at`: UTC 시각

이번 범위에서 제출은 `pending`으로 끝나며 점수를 지급하거나 승인 완료로 표시하지 않는다.

## 6. HTTP 계약

### 공통

- JSON 오류 형식: `{"code": "STABLE_CODE", "message": "한국어 메시지", "field": "optional"}`
- 쓰기 요청의 사용자 식별은 FastAPI가 `X-KTown-User-Id`에서 읽는다.
- 이 헤더는 브라우저가 직접 설정하지 않는다. vinext 서버 게이트웨이가 플랫폼 사용자 ID로 덮어쓴다.
- 체크인 리소스는 생성한 사용자만 읽거나 변경할 수 있다.

### 엔드포인트

```text
GET  /health
GET  /api/v1/places
GET  /api/v1/places/{place_id}
POST /api/v1/checkins
GET  /api/v1/checkins/{session_id}
POST /api/v1/checkins/{session_id}/gps
POST /api/v1/checkins/{session_id}/photo
POST /api/v1/checkins/{session_id}/submit
```

- 비공개·비활성 장소는 공개 조회에서 404다.
- 체크인 생성은 활성 공개 장소만 허용한다.
- GPS 순번은 이전 값보다 정확히 커야 한다.
- 사진 메타데이터는 허용 MIME, 크기, SHA-256 형식을 검증한다.
- 제출은 만료되지 않은 세션에 GPS와 사진이 모두 있을 때만 허용한다.
- 같은 멱등성 키의 재제출은 최초 성공 응답을 반환한다.
- 다른 멱등성 키로 이미 제출된 세션을 다시 제출하면 409다.

## 7. 웹 통합

현재 `AppServices` 인터페이스를 유지하고 다음 구현을 제공한다.

- `demo-services.ts`: 오프라인 데모. 실제 저장·수집이 아님을 명확히 표시한다.
- `http-services.ts`: 같은 출처 `/api/ktown/*` 게이트웨이를 호출한다.
- `service-factory.ts`: 서버에서만 읽는 환경변수로 `demo` 또는 `integrated` 구현을 선택한다.

vinext 게이트웨이는 허용된 K-Town 경로만 FastAPI로 전달한다. 브라우저가 보낸 `X-KTown-User-Id`와 인증 관련 헤더는 제거하고 플랫폼이 제공한 사용자 ID를 새로 설정한다. 응답의 hop-by-hop 및 민감 헤더는 전달하지 않는다.

통합 모드의 체크인 UI는 `collecting`, `ready`, `submitted/pending`, `expired`, 오류 상태를 표시한다. `pending` 상태에서 포인트를 표시하지 않는다.

## 8. 관광공사 API 키

필요한 키는 공공데이터포털의 `한국관광공사_국문 관광정보 서비스_GW` 일반 인증키다. 환경변수는 `KTOUR_SERVICE_KEY`이며 Decoding 키 사용을 기본으로 한다. 자동 테스트는 외부 API를 호출하지 않고 고정 응답을 사용한다. 키가 있을 때만 명시적인 실연동 스모크 테스트를 실행한다.

## 9. 오류와 트랜잭션

각 쓰기 API는 하나의 데이터베이스 트랜잭션 안에서 검증과 변경을 수행한다. unique 제약 충돌은 애플리케이션의 멱등성 또는 409 오류로 변환한다. 데이터베이스 오류의 내부 메시지와 외부 서비스 키는 응답이나 로그에 노출하지 않는다.

외부 관광공사 호출은 이번 세로형 요청 경로에 포함하지 않는다. 장소는 테스트 fixture, 관리 명령 또는 후속 동기화 작업으로 적재한다.

## 10. 테스트 전략

모든 새 동작은 RED-GREEN-REFACTOR 순서로 구현한다.

- 기존 102개 `unittest`: 인메모리 도메인 회귀
- FastAPI 단위/API 테스트: 오류 형식, 경계값, 소유권
- PostgreSQL 통합 테스트: 마이그레이션, 제약, 트랜잭션, 재접속 후 상태
- 웹 Vitest: HTTP DTO 매핑, 모드 선택, 체크인 상태 렌더링
- E2E: 웹 요청에서 DB 행 생성과 재조회까지
- 릴리스 검증: Python 전체 테스트, 웹 전체 테스트, lint, production build, HTTP smoke

PostgreSQL을 사용할 수 없는 환경에서는 해당 통합 테스트를 조용히 SQLite로 대체하지 않는다. 명시적으로 실패하거나, 테스트가 요구하는 Docker 전제조건을 안내한다.

## 11. 완료 기준

- 새 데이터베이스에서 `alembic upgrade head`가 성공한다.
- 공개 장소 목록과 상세가 PostgreSQL 데이터를 반환한다.
- 체크인 생성, GPS, 사진 메타데이터, 제출이 DB에 저장된다.
- 중복 제출, 만료, 소유권 위반이 안정적인 오류로 처리된다.
- 통합 웹 흐름이 `pending` 제출 상태를 정확히 표시한다.
- 기존 테스트와 신규 테스트, 린트, 빌드, 실행 스모크가 모두 통과한다.
- 기존 사용자 변경은 손실되거나 무관한 커밋에 포함되지 않는다.
