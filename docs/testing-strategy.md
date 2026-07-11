# PRISM testing strategy

PRISM uses deterministic tests as the default quality gate. Tests must not
require secrets, live model providers, network access, wall-clock timing, or
shared mutable process state.

## Commands

```bash
npm test                 # config, shared, API, and web tests
npm run test:coverage    # the same suites with Node coverage thresholds
npm run test:e2e         # Playwright browser smoke tests
npm run test:visual      # platform-specific visual snapshot lane
npm run test:perf        # deterministic SQLite/API performance probe
```

Run a focused package or test file when debugging:

```bash
npm run test --prefix apps/api -- --test-name-pattern="Coffee"
node --test --experimental-strip-types apps/web/src/app/coffee-cup-sprites.test.ts
```

## Test tiers

- Unit tests cover pure shared, API, and web helpers.
- Integration tests use `initializeDatabase` and deterministic providers so
  production schema, ownership rules, persistence, and provider boundaries are
  exercised without external services.
- Browser smoke tests cover the desktop-first auth shell, route/surface loading,
  and the authenticated Coffee picker with mocked API responses. Chat and Zen
  behavioral coverage remains concentrated in the deterministic API and unit
  suites until the large dirty page surface has a stable browser fixture.
- Visual snapshots are kept in a separate platform-specific lane so ordinary
  PR checks do not fail because macOS and Linux font rasterization differs.
- Performance tests are manual/nightly and report p50/p95 latency plus SQLite
  scale behavior. The harness seeds 10,000 messages and memories, asserts the
  critical ownership indexes are selected by `EXPLAIN QUERY PLAN`, measures a
  deterministic stubbed chat over HTTP, and checks 20 concurrent authenticated
  reads. They are not part of the default unit gate.
- Optional live-provider tests are isolated from required CI and must be
  explicitly enabled.

## Regression rules

- Every bug fix adds the smallest behavior test that would have caught it.
- Database schema changes update migration tests and use the production schema
  initializer in integration fixtures.
- New outbound fetches add a LOCAL-mode egress test and a deterministic mock.
- Coffee tests keep bot-scoped state, arrival scoping, cup pacing, replay, and
  optional departure behavior separate from shared session state.
- Tests use explicit timestamps and cleanup hooks instead of `Date.now()` or
  global state whenever behavior depends on time or environment.

## Coverage policy

The initial package thresholds are 85% lines, 65% branches, and 85% functions.
Generated workspace package output is excluded. The API route assembly file is
temporarily excluded from the package threshold while the route matrix grows;
it is still exercised by HTTP integration tests and will be brought into the
gate once the core route matrix is complete. Coverage is a regression signal,
not a substitute for route-level or browser behavior tests. Thresholds should
ratchet upward after the baseline is stable.
