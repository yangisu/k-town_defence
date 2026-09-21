# BTS 부산 경로 Python 기준선

- 기준 SHA: `origin/main@0565811e0013f9898eff06b4f0521d42293f543e`
- 격리 DB: 실행 시 새로 생성한 `ktown_ac1_retry2`
  (`KTOWN_TEST_DATABASE_URL`로 명시)
- 재현 결함: Alembic `env.py`가 테스트가 주입한 URL을 기본 설정으로 다시 덮어써서
  migration downgrade 검사가 다른 DB를 관측했다.
- 수정: Alembic 호출자가 설정한 URL을 보존하고, CLI에서는
  `KTOWN_DATABASE_URL`이 명시된 경우에만 그 값을 적용한다.
- 단독 검증: `tests/integration/test_migrations.py::test_upgrade_downgrade_and_reupgrade_manage_the_mvp_schema`
  가 base downgrade와 head re-upgrade를 모두 통과한다 (`1 passed`, exit 0).
- 빈 DB migration 검증:
  `$env:KTOWN_DATABASE_URL='postgresql+asyncpg://ktown:ktown@127.0.0.1:55432/ktown_ac1_retry2'; uv run --extra test python -m alembic upgrade head`
  가 `20260921_0012`까지 적용된다 (exit 0).
- 전체 검증:
  `$env:KTOWN_TEST_DATABASE_URL='postgresql+asyncpg://ktown:ktown@127.0.0.1:55432/ktown_ac1_retry2'; uv run --extra test python -m pytest -q`
  가 신규 BTS 경로·migration·legacy 회귀를 포함해 통과한다
  (`208 passed, 196 subtests passed`, exit 0).
- `python -m pytest -q`는 활성 Python에 test extra가 설치되지 않은 환경에서
  `No module named pytest`로 실패하므로 기준선 검증 명령으로 사용하지 않는다.
