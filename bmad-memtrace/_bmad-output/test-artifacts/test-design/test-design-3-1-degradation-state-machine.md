---
workflowStatus: draft
totalSteps: 5
stepsCompleted:
  - step-01-detect-mode
  - step-02-risk-assessment
  - step-03-coverage-plan
  - step-04-resource-estimates
  - step-05-execution-order
lastStep: step-05-execution-order
nextStep: ''
lastSaved: 2026-05-29T09:59:00Z
---

# Test Design: Epic 3 - Degradation State Machine

**Date:** 2026-05-29
**Author:** Murat (Master Test Architect)
**Status:** Draft

---

## Executive Summary

**Scope:** Story-level test design for Epic 3, Story 3.1 — Degradation State Machine

**Risk Summary:**

- Total risks identified: 7
- High-priority risks (>=6): 2
- Critical categories: Reliability, Correctness

**Coverage Summary:**

- P0 scenarios: 11 (7.0 hours)
- P1 scenarios: 11 (5.5 hours)
- P2/P3 scenarios: 14 (2.5 hours)
- **Total effort**: 36 tests, 15.0 hours (~2 days)

---

## Not in Scope

| Item                            | Reasoning                                                         | Mitigation                                                                              |
| ------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **Load/performance testing**    | Deferred to Epic 4 (Story 4.1 — k6 threshold validation)          | Unit tests verify state machine correctness; integration tests verify dispatch behavior |
| **Multi-instance degradation**  | MVP single-instance only; cluster coordination deferred to Growth | Single-instance isolation tested via unit + integration                                 |
| **User-manual tier override**   | `--force-tier` CLI flag deferred to Growth                        | Automated degradation handles all scenarios                                             |
| **Network partition detection** | Beyond MCP timeout — deferred to Epic 5                           | MCP timeout triggers probe failure → degradation                                        |

---

## Risk Assessment

### High-Priority Risks (Score >=6)

| Risk ID | Category | Description                                                                                                                                         | Probability | Impact | Score | Mitigation                                                                                                                       | Owner | Timeline |
| ------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------ | ----- | -------------------------------------------------------------------------------------------------------------------------------- | ----- | -------- |
| R-001   | REL      | **Fail-closed not triggered**: Probe failures fail to transition to FailClosed, allowing queries to proceed silently against an unavailable backend | 2           | 4      | 8     | P0 integration test verifies Full → IntentReduced → Passthrough → FailClosed chain; FailClosed dispatch returns structured error | DEV   | Sprint 3 |
| R-002   | CORR     | **Hysteresis gap**: Single transient probe failure triggers unnecessary degradation, causing performance regression and user confusion              | 2           | 3      | 6     | P0 test: 1 failure does NOT degrade; 3 consecutive failures required; counter reset on success                                   | DEV   | Sprint 3 |

### Medium-Priority Risks (Score 3-5)

| Risk ID | Category | Description                                                                                                                                | Probability | Impact | Score | Mitigation                                                                                       | Owner |
| ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------- | ------ | ----- | ------------------------------------------------------------------------------------------------ | ----- |
| R-003   | CORR     | **Floor enforcement asymmetry broken**: Floor allows upgrades (silent recovery), breaking the degradation contract                         | 2           | 2      | 4     | P0 test: floor Passthrough prevents upgrade; P1 integration: floor enforced through config       | DEV   |
| R-004   | CORR     | **Recovery jumps to Full incorrectly**: After partial recovery, machine jumps to Full when it should only recover to floor-restricted tier | 2           | 2      | 4     | P0 test: recovery jump goes straight to Full; P0 floor test: blocks at floor                     | DEV   |
| R-005   | REL      | **Probe timer leaks**: `setInterval` not cleaned up on `stop()` or process exit, causing dangling timers and process hang                  | 2           | 2      | 4     | P1 test: `stop()` prevents further probe calls; `shutdownDegradation()` called on SIGINT/SIGTERM | DEV   |

### Low-Priority Risks (Score 1-2)

| Risk ID | Category | Description                                                                                                          | Probability | Impact | Score | Action                                                                                      |
| ------- | -------- | -------------------------------------------------------------------------------------------------------------------- | ----------- | ------ | ----- | ------------------------------------------------------------------------------------------- | --- |
| R-006   | OPS      | **Transition reason metadata missing**: Agent response does not include tier/transition info, reducing observability | 1           | 2      | 2     | P0 test: transition reason recorded; P1 integration: response metadata enriched             | DEV |
| R-007   | OPS      | **Concurrent probe calls corrupt state**: Race condition in `recordProbeResult()` causes incorrect counters          | 1           | 1      | 1     | P2 concurrent safety test; machine uses synchronous private state (single-threaded Node.js) | DEV |

### Risk Category Legend

- **CORR**: Correctness (logic errors, state machine bugs, wrong tier transitions)
- **REL**: Reliability (fail-closed not triggered, probe timer leaks, missed degradation)
- **OPS**: Operations (missing observability, logging gaps, monitoring blind spots)

---

## NFR Planning

| NFR Category    | Requirement / Threshold                                                     | Risk Link | Planned Validation                                                      | Evidence Needed                  |
| --------------- | --------------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------- | -------------------------------- |
| Reliability     | Fail-closed triggers within 3 probe intervals (45s at 15s default)          | R-001     | Integration test: probe failures chain Full → FailClosed                | Test output showing tier changes |
| Reliability     | Zero dangling timers after shutdown                                         | R-005     | Unit test: `stop()` clears interval; CI verifies no `setInterval` leaks | ProbeTimer test results          |
| Maintainability | All degrade code uses `createLogger('degrade')` — zero `console.log`        | R-006     | ESLint rule `no-console`; code review                                   | Lint pass, code review           |
| Reliability     | Probe failure treated as probe failure (exceptions map to false, not crash) | R-001     | Unit test: probe throws → treated as failure                            | Timer test with throw mock       |

**Unknown thresholds:** Adaptive degradation thresholds (hardcoded at 3 in MVP); user-manual override (deferred); multi-instance failover (deferred).

---

## Entry Criteria

- [ ] Story 3.1 ACs finalized and approved
- [ ] `DegradationTier` enum and types in `src/types.ts` (already exist from scaffold)
- [ ] `HYSTERESIS_PROBE_COUNT`, `PROBE_INTERVAL_MS` constants in `src/constants.ts` (already exist)
- [ ] `MemtraceBackend.probe()` trait defined (already exists)
- [ ] `createLogger('degrade')` available (already exists via `src/logger.ts`)
- [ ] `MiddlewareError` class available (already exists)

## Exit Criteria

- [ ] All P0 tests passing — 10 unit + 3 integration
- [ ] All P1 tests passing — 5 unit + 6 integration (or failures triaged)
- [ ] No open high-priority degradation bugs
- [ ] `pnpm typecheck` zero errors
- [ ] `pnpm lint` zero ESLint errors on degrade files
- [ ] `pnpm build` compiles ESM + CJS + DTS

---

## Test Coverage Plan

### P0 (Critical) — Run on every commit

**Criteria**: Blocks core journey + High risk (>=6) + No workaround

| Requirement                                                | Test Level | Risk Link | Test Count | Owner | Notes                                                          |
| ---------------------------------------------------------- | ---------- | --------- | ---------- | ----- | -------------------------------------------------------------- |
| Hysteresis: 3 failures trigger degrade, 1 failure does not | Unit       | R-002     | 3          | DEV   | machine.test.ts: single failure, triple failure, counter reset |
| Full degrade chain: Full → IR → PT → FC                    | Unit       | R-001     | 3          | DEV   | machine.test.ts: 3, 6, 9 consecutive failures                  |
| Recovery: 3 successes restore Full (jump)                  | Unit       | R-001     | 1          | DEV   | machine.test.ts: Passthrough → Full jump                       |
| Floor enforcement: blocks upgrades, allows downgrades      | Unit       | R-003     | 2          | DEV   | machine.test.ts: floor Passthrough and IntentReduced           |
| Initial state: Full tier                                   | Unit       | R-001     | 1          | DEV   | machine.test.ts: default state                                 |
| Probe timer: start/stop lifecycle                          | Unit       | R-005     | 1          | DEV   | probe-timer.test.ts: timer fires on interval                   |

**Total P0**: 11 tests, 7.0 hours

### P1 (High) — Run on PR to main

**Criteria**: Important features + Medium risk (3-4) + Common workflows

| Requirement                                               | Test Level  | Risk Link | Test Count | Owner | Notes                                                  |
| --------------------------------------------------------- | ----------- | --------- | ---------- | ----- | ------------------------------------------------------ |
| Integration: Full → IntentReduced via probe failures      | Integration | R-001     | 1          | DEV   | degradation.test.ts: real flow through BaseAdapter     |
| Integration: IntentReduced → Passthrough                  | Integration | R-001     | 1          | DEV   | degradation.test.ts: continued degradation             |
| Integration: Passthrough → FailClosed                     | Integration | R-001     | 1          | DEV   | degradation.test.ts: full chain                        |
| Integration: Full recovery                                | Integration | R-001     | 1          | DEV   | degradation.test.ts: probe successes restore Full      |
| Integration: FailClosed dispatch returns structured error | Integration | R-001     | 1          | DEV   | degradation.test.ts: error shape verification          |
| Integration: IntentReduced runs sequentially              | Integration | R-001     | 1          | DEV   | degradation.test.ts: no parallelism                    |
| Integration: Passthrough skips classification/fusion      | Integration | R-003     | 1          | DEV   | degradation.test.ts: raw results with passthrough flag |
| Transition metadata tracking (reason, history)            | Unit        | R-006     | 2          | DEV   | machine.test.ts: getTransitionReason, tierHistory      |
| Interleaved failures/successes                            | Unit        | R-002     | 1          | DEV   | machine.test.ts: mix of results                        |
| Probe timer: stop prevents further calls                  | Unit        | R-005     | 1          | DEV   | probe-timer.test.ts: cleanup                           |
| Probe timer: restart changes interval                     | Unit        | R-005     | 1          | DEV   | probe-timer.test.ts: hot-reload                        |
| Probe timer: throw treated as failure                     | Unit        | R-005     | 1          | DEV   | probe-timer.test.ts: error handling                    |
| Integration: response metadata enrichment                 | Integration | R-006     | 1          | DEV   | degradation.test.ts: tier + reason in metadata         |
| Integration: error type preserved end-to-end              | Integration | R-006     | 1          | DEV   | degradation.test.ts: recoverable flag                  |
| Integration: floor enforcement                            | Integration | R-003     | 1          | DEV   | degradation.test.ts: config floor blocks upgrade       |

**Total P1**: 11 tests, 5.5 hours

### P2 (Medium) — Run nightly/weekly

**Criteria**: Secondary features + Low risk (1-2) + Edge cases

| Requirement                                      | Test Level  | Risk Link | Test Count | Owner | Notes                                                |
| ------------------------------------------------ | ----------- | --------- | ---------- | ----- | ---------------------------------------------------- |
| reset() returns to Full, clears history          | Unit        | -         | 1          | DEV   | machine.test.ts: test isolation                      |
| Concurrent safety simulation                     | Unit        | R-007     | 1          | DEV   | machine.test.ts: rapid probe calls                   |
| Probe timer: isRunning() state                   | Unit        | -         | 1          | DEV   | probe-timer.test.ts: status query                    |
| Integration: single probe failure no tier change | Integration | R-002     | 1          | DEV   | degradation.test.ts: hysteresis at integration level |

**Total P2**: 4 tests, 2.5 hours

### P3 (Low) — Run on-demand

N/A for this story — all scenarios are covered by P0-P2. No exploratory or benchmark tests needed for the state machine.

---

## Execution Order

### Smoke Tests (<5 min)

**Purpose**: Fast feedback, catch build-breaking issues

- [ ] [P0] initial state is Full tier (machine.test.ts) — 30s
- [ ] [P0] single probe failure does NOT trigger degradation (machine.test.ts) — 30s
- [ ] [P0] three consecutive probe failures triggers Full → IntentReduced (machine.test.ts) — 30s

**Total**: 3 scenarios

### P0 Tests (<10 min)

**Purpose**: Critical path validation

- [ ] [P0] Full degrade chain: 6 failures, 9 failures (machine.test.ts) — 30s
- [ ] [P0] recovery: 3 successes → Full jump (machine.test.ts) — 30s
- [ ] [P0] floor enforcement (machine.test.ts) — 30s
- [ ] [P0] counter reset on success (machine.test.ts) — 30s
- [ ] [P0] probe timer lifecycle (probe-timer.test.ts) — 30s

**Total**: 8 scenarios

### P1 Tests (<30 min)

**Purpose**: Important feature coverage

- [ ] [P1] integration: Full → IntentReduced → Passthrough → FailClosed (degradation.test.ts) — 2min
- [ ] [P1] integration: recovery (degradation.test.ts) — 2min
- [ ] [P1] integration: FailClosed error shape (degradation.test.ts) — 2min
- [ ] [P1] integration: IntentReduced sequential (degradation.test.ts) — 2min
- [ ] [P1] integration: Passthrough skips fusion (degradation.test.ts) — 2min
- [ ] [P1] integration: metadata enrichment (degradation.test.ts) — 2min
- [ ] [P1] integration: floor enforcement (degradation.test.ts) — 2min
- [ ] [P1] transition tracking and history (machine.test.ts) — 30s
- [ ] [P1] interleaved results (machine.test.ts) — 30s
- [ ] [P1] probe stop/restart/throw (probe-timer.test.ts) — 30s

**Total**: 14 scenarios

### P2 Tests (<60 min)

**Purpose**: Full regression coverage

- [ ] [P2] reset() clears state (machine.test.ts) — 30s
- [ ] [P2] concurrent safety simulation (machine.test.ts) — 30s
- [ ] [P2] integration: single failure no tier change (degradation.test.ts) — 2min
- [ ] [P2] isRunning() state (probe-timer.test.ts) — 30s

**Total**: 4 scenarios

---

## Resource Estimates

### Test Development Effort

| Priority  | Count  | Hours/Test | Total Hours | Notes                                                        |
| --------- | ------ | ---------- | ----------- | ------------------------------------------------------------ |
| P0        | 11     | 2.0        | 22.0        | State machine logic, hysteresis, floor — complex correctness |
| P1        | 11     | 1.0        | 11.0        | Integration wiring, metadata, timer lifecycle                |
| P2        | 4      | 0.5        | 2.0         | Edge cases, concurrency simulation                           |
| **Total** | **26** | **-**      | **35.0**    | **~4 days**                                                  |

### Prerequisites

**Test Data:**

- `createProbeMockBackend()` factory fixture (`tests/fixtures/degradation-mock.ts`) — mock backend with configurable probe success/failure

**Tooling:**

- `vitest` (already configured in project)
- `vi.useFakeTimers()` / `vi.advanceTimersByTime()` for deterministic probe timing

**Environment:**

- Node.js >= 20 (already configured)
- pnpm (already configured)
- No external service dependencies — all tests use in-process mocks

---

## Quality Gate Criteria

### Pass/Fail Thresholds

- **P0 pass rate**: 100% (no exceptions)
- **P1 pass rate**: >=95% (waivers required for failures)
- **P2 pass rate**: >=90% (informational)
- **High-risk mitigations**: 100% complete or approved waivers

### Coverage Targets

- **Critical paths (hysteresis, degrade chain, recovery, floor, fail-closed)**: 100%
- **State machine logic**: 100% branch coverage
- **Timer lifecycle (start/stop/restart/throw)**: 100%
- **Integration wiring (dispatch behaviors per tier)**: 100%
- **Edge cases (interleaved results, concurrent access)**: >=60%

### Non-Negotiable Requirements

- [ ] All P0 tests pass
- [ ] No high-risk (>=6) items unmitigated
- [ ] Fail-closed dispatch returns structured error, never reaches backend
- [ ] Hysteresis prevents single transient blip from degrading
- [ ] Floor enforcement blocks upgrades, allows downgrades
- [ ] Zero dangling timers after shutdown

---

## Mitigation Plans

### R-001: Fail-closed not triggered during Memtrace unavailability (Score: 8)

**Mitigation Strategy:** Three layers of defense: (1) unit tests verify `DegradationMachine` state transitions at each tier boundary, (2) integration tests verify the full Full → IntentReduced → Passthrough → FailClosed chain through `BaseAdapter.dispatch()`, (3) Fail-closed integration test verifies structured error return shape with all envelope fields.
**Owner:** DEV
**Timeline:** Sprint 3
**Status:** Planned
**Verification:** All 3 chain-degrade unit tests + 4 integration tests pass

### R-002: Hysteresis gap triggers unnecessary degradation (Score: 6)

**Mitigation Strategy:** (1) Unit test: 1 failure stays Full (no degradation), (2) Unit test: mixed failures and successes reset counter correctly, (3) Integration test: single transient blip does not trigger tier change.
**Owner:** DEV
**Timeline:** Sprint 3
**Status:** Planned
**Verification:** 3 P0/P1 tests verify hysteresis behavior

### R-003: Floor enforcement asymmetry broken (Score: 4)

**Mitigation Strategy:** (1) Unit test: floor Passthrough prevents upgrade to IntentReduced, (2) Unit test: floor IntentReduced allows Passthrough downgrade but blocks upgrade to Full, (3) Integration test: config floor enforced through `initializeDegradation()`.
**Owner:** DEV
**Timeline:** Sprint 3
**Status:** Planned
**Verification:** 2 unit + 1 integration floor tests pass

### R-005: Probe timer leaks on shutdown (Score: 4)

**Mitigation Strategy:** (1) Unit test: `stop()` prevents further probe calls (clearInterval), (2) Integration: `shutdownDegradation()` called on SIGINT/SIGTERM in CLI, (3) Code review: every `setInterval` paired with `clearInterval`.
**Owner:** DEV
**Timeline:** Sprint 3
**Status:** Planned
**Verification:** ProbeTimer stop test passes; CLI exit cleanup verified

---

## Assumptions and Dependencies

### Assumptions

1. `DegradationTier` enum ordinal matches architecture: Full=0, IntentReduced=1, Passthrough=2, FailClosed=3
2. `HYSTERESIS_PROBE_COUNT = 3` is correct and imported from `src/constants.ts` (not hardcoded)
3. `PROBE_INTERVAL_MS = 15000` is correct and imported from `src/constants.ts`
4. Recovery is always a jump to Full (not step-by-step), blocked by floor
5. `MemtraceBackend.probe()` returns `Promise<boolean>` — true = healthy, false = unhealthy
6. `MiddlewareError` constructor accepts `{cause, recoverable, suggested_action, tier}` and provides `toShape()`
7. Probe timer runs independently of dispatch — no coupling between probe cadence and dispatch timing
8. The `DegradationMachine` singleton follows the same pattern as `src/telemetry/metrics.ts` (module-level singleton with controlled mutations)

### Dependencies

1. `src/constants.ts` must export `HYSTERESIS_PROBE_COUNT` and `PROBE_INTERVAL_MS` — already exists
2. `src/types.ts` must export `DegradationTier` enum — already exists
3. `src/config/types.ts` must export `normalizeFloor()`, `MiddlewareConfig`, `DegradationFloor` — already exists
4. `src/errors.ts` must export `MiddlewareError` — already exists
5. `src/backend/trait.ts` must export `MemtraceBackend` — already exists
6. `src/logger.ts` must export `createLogger` — already exists
7. `src/degrade/index.ts` placeholder must be replaced — existing file, no breaking changes expected

### Risks to Plan

- **Risk**: Probe timer tests require `vi.useFakeTimers()` — must ensure cleanup with `vi.useRealTimers()` in `afterEach` to avoid test pollution
  - **Impact**: Test pollution may cause flaky tests and false failures
  - **Contingency**: Use `afterEach(() => { vi.useRealTimers(); })` in every probe timer test suite; include in test template

---

## Interworking & Regression

| Service/Component          | Impact                                                                                             | Regression Scope                                                   |
| -------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **BaseAdapter.dispatch()** | Modified: degradation checks at entry, sequential execution, passthrough mode, metadata enrichment | Existing isolation.test.ts, fusion-pipeline.test.ts must pass      |
| **CLI index.ts**           | Modified: `initializeDegradation()` and `shutdownDegradation()` calls                              | Existing CLI integration tests must pass                           |
| **degrade/index.ts**       | Replaced placeholder with full module — same exports preserved                                     | Status display (status.ts) must still consume `getFloorOverride()` |
| **Telemetry/metrics.ts**   | No modification — reads tier from machine via existing pattern                                     | Status display tests must still pass                               |

---

## Appendix

### Knowledge Base References

- `tea-index.csv` — Full knowledge fragment mapping
- `risk-governance.md` — Risk classification framework
- `probability-impact.md` — Risk scoring methodology
- `test-levels-framework.md` — Test level selection
- `test-priorities-matrix.md` — P0-P3 prioritization

### Related Documents

- PRD: `planning-artifacts/prd.md` — FR9, FR15-FR22, NFR14-NFR18
- Epic: `planning-artifacts/epics.md` — Epic 3, Story 3.1
- Architecture: `planning-artifacts/architecture.md` — Degradation State Machine, Error Envelope
- Story: `_bmad-output/implementation-artifacts/3-1-degradation-state-machine.md`

---

**Generated by**: BMad TEA Agent — Test Architect Module
**Workflow**: `bmad-testarch-test-design`
**Version**: 4.0 (BMad v6)
