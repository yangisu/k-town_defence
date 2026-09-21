# BTS route Python baseline

- Baseline: `origin/main@0565811e0013f9898eff06b4f0521d42293f543e`
- Isolated database: `ktown_test` at the repository's test database URL
- Initial command: `uv run --extra test pytest`
- Initial result: exit 1 during collection; six modules could not import
  `tests.conftest` because `tests` was not a package.
- Migration defect: `alembic/env.py` replaced a caller-provided isolated URL
  with the application default, so migration tests operated on the wrong
  database and left the isolated database unverified.
- Resolution: add the test package marker and preserve caller-provided Alembic
  URLs. The migration test now performs base → head → base → head against the
  isolated database.

This dispatch covers the Python acceptance criterion only. Web tests and the
production build belong to their separate acceptance dispatch and are not
claimed here.
