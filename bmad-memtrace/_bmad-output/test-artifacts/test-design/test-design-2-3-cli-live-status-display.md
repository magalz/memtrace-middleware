---
workflowStatus: 'approved'
totalSteps: 5
stepsCompleted:
  - step-01-detect-mode
  - step-02-analyze-requirements
  - step-03-risk-assessment
  - step-04-coverage-plan
  - step-05-generate-output
lastStep: step-05-generate-output
nextStep: ''
lastSaved: '2026-05-29T09:16:00Z'
---

# Test Design: Epic 2 - Memtrace Middleware Observability & CLI

**Date:** 2026-05-29
**Author:** Murat (Master Test Architect)
**Status:** Approved

---

## Executive Summary

**Scope:** Unit-level test design for Story 2.3 — CLI Live Status Display

**Risk Summary:**

- Total risks identified: 8
- High-priority risks (≥6): 3
- Critical categories: DATA (ring buffer integrity), PERF (refresh cycle), OPS (TTY/piped contract)

**Coverage Summary:**

- P0 scenarios: 8 (5.0 hours)
- P1 scenarios: 12 (6.0 hours)
- P2/P3 scenarios: 12 (3.0 hours)
- **Total effort**: 28 tests, ~14.0 hours (~2 days)

---

## Not in Scope

| Item                                                                               | Reasoning                                                                                | Mitigation                                         |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------- |
| **Full telemetry emitter pipeline** (tracer.ts, detailed per-phase event emission) | Deferred to Epic 4, Story 4.1                                                            | No testing needed now — story boundaries respected |
| **CLI `start` command (server mode)**                                              | Placeholder only in this story — server mode requires full pipeline lifecycle management | No testing needed until that story                 |
| **End-to-end integration with Memtrace MCP server**                                | This story uses in-memory ring buffer — no Memtrace polling                              | Ring buffer tests verify data source isolation     |
| **Web UI or dashboard telemetry**                                                  | Deferred beyond MVP                                                                      | Not in scope for this epic                         |
| **Performance benchmarks for 99th percentile latency**                             | Story only uses p50/p95 from a ring buffer of 100 confidence values                      | Covered by unit tests on confidence calculation    |
| **Cross-process ring buffer persistence**                                          | Single-process in-memory only                                                            | Crash tolerance not required — state is ephemeral  |

---

## Risk Assessment

### High-Priority Risks (Score ≥6)

| Risk ID | Category | Description                                                                                                                         | Probability | Impact | Score | Mitigation                                                                                                                                                                                                                             | Owner | Timeline   |
| ------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------ | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ---------- |
| R-001   | DATA     | Ring buffer concurrent read during write returns inconsistent snapshot (stale/mixed data)                                           | 3           | 3      | 9     | Enforce `toArray()` returns a frozen shallow copy; add property-based test for concurrent read safety (sequential simulation). Ring buffer is single-threaded (Node.js), but any async access pattern must still get a consistent view | DEV   | Story impl |
| R-002   | PERF     | 500ms setInterval drifts or accumulates if render takes >500ms, causing overlapped writes or memory growth                          | 2           | 3      | 6     | Use `setInterval` with a guard: if previous render is still running, skip this cycle. On `stop()`, `clearInterval` must be called. Test with artificially slow renders                                                                 | DEV   | Story impl |
| R-003   | OPS      | TTY detection (`process.stdout.isTTY`) is unreliable on Windows (ConPTY, Git Bash, WSL, CI pipelines) producing wrong output format | 2           | 3      | 6     | Fallback to piped NDJSON when isTTY is falsy or undefined. Document in dev notes that CI always produces NDJSON. Test both branches explicitly with mocked isTTY values                                                                | DEV   | Story impl |

### Medium-Priority Risks (Score 3-4)

| Risk ID | Category | Description                                                                                            | Probability | Impact | Score | Mitigation                                                                                      | Owner |
| ------- | -------- | ------------------------------------------------------------------------------------------------------ | ----------- | ------ | ----- | ----------------------------------------------------------------------------------------------- | ----- |
| R-004   | TECH     | p50/p95 confidence calculation on empty dataset (0 dispatches) produces NaN, Infinity, or throws       | 2           | 2      | 4     | Guard: if confidence array is empty, return 0 for both p50 and p95. Test with empty buffer      | DEV   |
| R-005   | TECH     | Flash indicator leaks across stop/start cycles (not reset on stop())                                   | 2           | 2      | 4     | On `stop()`, reset flashCounter to 0. Verify via `getFlashState()` internal helper during tests | DEV   |
| R-006   | DATA     | Ring buffer capacity=0 is not rejected, causing infinite loop or division by zero in modulo operations | 2           | 2      | 4     | Clamp capacity to minimum of 1 or throw in constructor. Test with capacity=0 explicitly         | DEV   |

### Low-Priority Risks (Score 1-2)

| Risk ID | Category | Description                                                                                                    | Probability | Impact | Score | Action                                                                                                                                                          |
| ------- | -------- | -------------------------------------------------------------------------------------------------------------- | ----------- | ------ | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| R-007   | BUS      | NDJSON piped output is not parseable by `jq` because of extraneous non-JSON content (e.g., logger stderr leak) | 1           | 2      | 2     | Verify NDJSON output via regex: each line must be valid JSON. Add `jq` test in CI pipeline. Use `createLogger` to stderr — stdout reserved for CLI display only | Monitor |
| R-008   | OPS      | `version` field reads `package.json` at each refresh (500ms fs read) causing I/O churn                         | 1           | 2      | 2     | Use static constant `MIDDLEWARE_VERSION` in `src/constants.ts` — no runtime fs reads                                                                            | Monitor |

### Risk Category Legend

- **TECH**: Technical/Architecture (flaws, integration, scalability)
- **SEC**: Security (access controls, auth, data exposure)
- **PERF**: Performance (SLA violations, degradation, resource limits)
- **DATA**: Data Integrity (loss, corruption, inconsistency)
- **BUS**: Business Impact (UX harm, logic errors, revenue)
- **OPS**: Operations (deployment, config, monitoring)

---

## NFR Planning

| NFR Category    | Requirement / Threshold                                                                  | Risk Link | Planned Validation                                                          | Evidence Needed              |
| --------------- | ---------------------------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------- | ---------------------------- |
| Reliability     | Ring buffer concurrent read safety — toArray() returns consistent snapshot during writes | R-001     | Unit test: sequential simulation of concurrent read during write            | Test pass                    |
| Performance     | 500ms refresh interval does not leak setInterval handles                                 | R-002     | Unit test: start/stop cycle verifies clearInterval called, no orphan timers | Test pass + no memory growth |
| Maintainability | TTY vs piped output contract is stable across terminals and CI                           | R-003     | Unit test: both branches with mocked isTTY=true/false/undefined             | Test passes                  |
| Maintainability | Zero `console.log` in all new code                                                       | —         | ESLint no-console rule + manual review                                      | ESLint pass                  |
| Security        | NDJSON output to stdout — no mixing of telemetry stderr with CLI display                 | R-007     | Code review: all log output goes to stderr via createLogger()               | Code review pass             |

**Unknown thresholds:** No NFR thresholds invented — this is a CLI display, not a server. Latency requirements are implicit (500ms refresh). No SLAs defined.

---

## Entry Criteria

- [ ] Story file `2-3-cli-live-status-display.md` finalized with all ACs
- [ ] `tests/unit/telemetry/` directory created
- [ ] `tests/unit/cli/` directory created
- [ ] `pnpm test` baseline: 168 tests pass across 18 files (no regressions from prior stories)
- [ ] `pnpm typecheck` passes on HEAD
- [ ] `pnpm lint` passes on HEAD

## Exit Criteria

- [ ] All P0 tests passing (both ring buffer and CLI status)
- [ ] All P1 tests passing (or failures triaged with accepted reasoning)
- [ ] All 28 new tests pass alongside existing 168 (total ≥ 196)
- [ ] No open P0/P1 bugs
- [ ] `pnpm typecheck` — zero errors
- [ ] `pnpm lint` — zero errors (no-console rule enforced)
- [ ] `pnpm build` — ESM+CJS+DTS compiled without errors

---

## Test Coverage Plan

### P0 (Critical) — Run on every commit

**Criteria:** Blocks core journey + High risk (≥6) + No workaround

| Requirement                        | Test Level | Risk Link | Test Count | Owner | Notes                                          |
| ---------------------------------- | ---------- | --------- | ---------- | ----- | ---------------------------------------------- |
| Ring buffer push/overflow          | Unit       | R-001     | 2          | DEV   | Capacity enforcement + oldest dropped          |
| Ring buffer wrap-around            | Unit       | R-001     | 2          | DEV   | head < tail after overflow                     |
| Ring buffer concurrent read safety | Unit       | R-001     | 1          | DEV   | Sequential simulation of read during write     |
| CLI status JSON piped output       | Unit       | R-003     | 1          | DEV   | All 9 required keys present with correct types |
| CLI status TTY ANSI output         | Unit       | R-003     | 1          | DEV   | `\r`, color codes, health dot present          |
| CLI flash indicator                | Unit       | R-005     | 1          | DEV   | 3-cycle flash then clear                       |

**Total P0**: 8 tests, 5.0 hours

### P1 (High) — Run on PR to main

**Criteria:** Important features + Medium risk (3-4) + Common workflows

| Requirement                                       | Test Level | Risk Link | Test Count | Owner | Notes                                         |
| ------------------------------------------------- | ---------- | --------- | ---------- | ----- | --------------------------------------------- |
| Ring buffer edge cases (capacity 1, empty, clear) | Unit       | R-006     | 4          | DEV   | Boundary conditions                           |
| Ring buffer toArray copy isolation                | Unit       | R-001     | 1          | DEV   | Mutate returned array, buffer unaffected      |
| CLI degraded tier output                          | Unit       | —         | 1          | DEV   | All 4 tiers produce correct health dot + name |
| CLI confidence p50/p95 validity                   | Unit       | R-004     | 1          | DEV   | isFinite check, non-NaN                       |
| CLI active_intents type                           | Unit       | —         | 1          | DEV   | Array of strings                              |
| CLI query counts type                             | Unit       | —         | 1          | DEV   | Non-negative integers                         |
| CLI null snapshot resilience                      | Unit       | —         | 1          | DEV   | Graceful handling, no crash                   |
| CLI flash counter decrement                       | Unit       | R-005     | 1          | DEV   | flashCounter state machine                    |
| CLI piped NDJSON one-line-per-refresh             | Unit       | R-007     | 1          | DEV   | Exactly one JSON line per call                |

**Total P1**: 12 tests, 6.0 hours

### P2 (Medium) — Run nightly/weekly

**Criteria:** Secondary features + Low risk (1-2) + Edge cases

| Requirement                           | Test Level | Risk Link | Test Count | Owner | Notes                                |
| ------------------------------------- | ---------- | --------- | ---------- | ----- | ------------------------------------ |
| Ring buffer multiple wrap-arounds     | Unit       | —         | 1          | DEV   | 3+ full cycles                       |
| Ring buffer 100k stress               | Unit       | —         | 1          | DEV   | No throw, no memory growth           |
| Ring buffer confidence buffer pattern | Unit       | —         | 1          | DEV   | RingBuffer<number> works identically |
| CLI piped NDJSON no ANSI codes        | Unit       | R-003     | 1          | DEV   | Regex negate `\x1b\[`                |
| CLI version is string                 | Unit       | —         | 1          | DEV   | typeof check                         |
| CLI getCount accuracy                 | Unit       | —         | 1          | DEV   | After mixed push/clear cycles        |
| CLI toArray order after wrap          | Unit       | —         | 1          | DEV   | Oldest→newest ordering               |

**Total P2**: 12 tests, 3.0 hours

---

## Execution Order

### Smoke Tests (<5 min)

**Purpose:** Fast feedback, catch build-breaking issues

- **Purpose:** Fast feedback, catch build-breaking issues
- [ ] Ring buffer basic push + toArray (30s)
- [ ] CLI status JSON output via renderStatus() (30s)
- [ ] CLI status TTY output (30s)

**Total:** 3 smoke scenarios

### P0 Tests (<10 min)

**Purpose:** Critical path validation

- [ ] Ring buffer overflow + wrap-around (Unit)
- [ ] Ring buffer concurrent read safety (Unit)
- [ ] CLI status piped JSON keys and types (Unit)
- [ ] CLI status TTY ANSI output (Unit)
- [ ] CLI flash indicator 3-cycle (Unit)
- [ ] CLI degraded tier output per tier (Unit)

**Total:** 6 P0 scenarios

### P1 Tests (<30 min)

**Purpose:** Important feature coverage

- [ ] Ring buffer edge cases (Unit, 4 tests)
- [ ] Ring buffer toArray copy isolation (Unit)
- [ ] CLI confidence validity (Unit)
- [ ] CLI null snapshot resilience (Unit)
- [ ] CLI NDJSON line format (Unit)

**Total:** 5 P1 scenarios

### P2/P3 Tests (<60 min)

**Purpose:** Full regression coverage

- [ ] Ring buffer stress test 100k ops (Unit)
- [ ] Ring buffer multiple wrap (Unit)
- [ ] CLI no ANSI in piped mode (Unit)

**Total:** 3 P2/P3 scenarios

---

## Resource Estimates

### Test Development Effort

| Priority  | Count  | Hours/Test | Total Hours | Notes                                                                          |
| --------- | ------ | ---------- | ----------- | ------------------------------------------------------------------------------ |
| P0        | 8      | 2.0        | 16.0        | Ring buffer concurrent safety, CLI format contracts require careful assertions |
| P1        | 12     | 1.0        | 12.0        | Standard coverage, property-based ring buffer variants                         |
| P2        | 8      | 0.5        | 4.0         | Simple edge cases and stress tests                                             |
| **Total** | **28** | **-**      | **32.0**    | **~4 days**                                                                    |

### Prerequisites

**Test Data:**

- StatusSnapshot inline mocks — no external fixtures needed
- RingBuffer<T> with numeric and string types

**Tooling:**

- vitest (`pnpm test`) for all test execution
- No external test dependencies beyond existing project setup

**Environment:**

- Node.js >= 20 (same as project requirement)
- No terminal required — isTTY is mocked in tests
- CI pipeline that supports `pnpm test`

---

## Quality Gate Criteria

### Pass/Fail Thresholds

- **P0 pass rate**: 100% (no exceptions)
- **P1 pass rate**: ≥95% (waivers required for failures)
- **P2/P3 pass rate**: ≥90% (informational)
- **High-risk mitigations**: 100% complete or approved waivers

### Coverage Targets

- **Critical paths**: ≥80% (ring buffer push/toArray, CLI renderStatus, flash indicators)
- **Edge cases**: ≥50% (capacity 0, capacity 1, empty buffer, null snapshot)
- **Security scenarios**: N/A (no auth, no data exposure)
- **Business logic**: ≥70% (TTY vs piped contract, tier mapping, confidence computation)

### Non-Negotiable Requirements

- [ ] All P0 tests pass
- [ ] No high-risk (≥6) items unmitigated
- [ ] No `console.log` in any new code
- [ ] Every `setInterval` has matching `clearInterval` via `stop()`
- [ ] `toArray()` returns a defensive copy, not internal reference

---

## Mitigation Plans

### R-001: Ring buffer concurrent read returns inconsistent snapshot (Score: 9)

**Mitigation Strategy:** `toArray()` must take a snapshot of current head/tail atomically (in JS, the property reads are synchronous), iterate a copy, and freeze the returned array (or at minimum return a new array). Add a dedicated test that simulates read-during-write by interleaving push() calls with toArray() and verifying the snapshot is internally consistent (items are in order, no duplicates, count matches).

**Owner:** DEV
**Status:** Planned
**Verification:** Test `[P1] handles concurrent read during write (sequential simulation)` passes

### R-002: 500ms setInterval drifts or overlaps renders (Score: 6)

**Mitigation Strategy:** Use a guard variable (`renderingInProgress`) inside `startStatusDisplay()`. If set, skip the current cycle. On `stop()`, set a flag to prevent re-entry. Test with an artificially slow `getSnapshot()` that takes 600ms.

**Owner:** DEV
**Status:** Planned
**Verification:** Test verifies start/stop lifecycle and that overlapping renders do not occur

### R-003: TTY detection unreliable on Windows (Score: 6)

**Mitigation Strategy:** Default to piped NDJSON output when `isTTY` is `undefined` or `falsy`. Both output paths must be tested with mocked `isTTY` values: `true`, `false`, and `undefined`. Document in dev notes that CI always produces NDJSON.

**Owner:** DEV
**Status:** Planned
**Verification:** Three test cases: isTTY=true → ANSI mode; isTTY=false → NDJSON; isTTY=undefined → NDJSON (fallback)

---

## Assumptions and Dependencies

### Assumptions

1. `STATUS_REFRESH_MS = 500` already exists in `src/constants.ts` — tests will import it from there, not hardcode 500
2. `DegradationTier` enum already exists in `src/types.ts` with values `Full`, `IntentReduced`, `Passthrough`, `FailClosed`
3. Existing 168 tests continue to pass — no regressions
4. The `version` string `"2.0.0"` is set as a static constant — no runtime `package.json` reads
5. All new files use kebab-case: `ring-buffer.ts`, `status.ts`, `emitter.ts`, `metrics.ts`, `uptime.ts`
6. Ring buffer is single-threaded (Node.js event loop) — no actual concurrent access, only sequential interleaving

### Dependencies

1. `src/types.ts` — must have `StatusSnapshot` and `EventType` types added (prerequisite for status tests)
2. `src/constants.ts` — must have `MIDDLEWARE_VERSION` constant added
3. `src/telemetry/ring-buffer.ts` — must exist before metrics.ts can use it
4. `src/telemetry/metrics.ts` — must exist before cli/status.ts can read snapshots

### Risks to Plan

- **Risk**: Story 2.3 depends on types from Story 2.2 (`DegradationTier`, `DispatchContext`)
  - **Impact**: StatusSnapshot cannot reference DegradationTier if import fails
  - **Contingency**: Verified HEAD commit `ce23cc2` includes all needed types

---

## Follow-on Workflows (Manual)

- Run `*automate` for broader coverage once implementation exists (e.g., integration tests for metrics + status pipeline)
- Run `*test-review` post-implementation to audit test quality

---

## Approval

**Test Design Approved By:**

- [ ] Product Manager: John (context: PRD FR29-FR32)
- [ ] Tech Lead: Amelia (context: story author)
- [x] QA Lead: Murat (context: this document)

**Comments:**

Design covers all 6 ACs with 28 test scaffolds. Ring buffer tests are the foundation — they should be implemented first and pass before any CLI status work begins. The concurrent read safety risk (R-001, score 9) is the highest priority item and must be addressed in both implementation and tests.

---

## Interworking & Regression

| Service/Component                 | Impact                                                                                               | Regression Scope                                                     |
| --------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **src/constants.ts**              | Add `MIDDLEWARE_VERSION` — existing constants unchanged                                              | All existing tests importing constants must pass unchanged           |
| **src/types.ts**                  | Add `StatusSnapshot` and `EventType` — existing types unchanged                                      | All existing type consumers must compile unchanged                   |
| **src/interface/base-adapter.ts** | Add `metrics.recordDispatch()` call after `buildDefaultContext()` — existing orchestration untouched | 6 isolation tests in `tests/integration/isolation.test.ts` must pass |
| **src/telemetry/index.ts**        | Replace placeholder with barrel exports — no existing consumers                                      | No existing test imports from this barrel yet                        |
| **src/cli/index.ts**              | Replace placeholder with `--status` entry point — no existing consumers                              | No existing test imports from this file yet                          |
| **src/index.ts**                  | Barrel export additions — new public symbols                                                         | Existing barrel exports must remain unchanged                        |

---

## Appendix

### Knowledge Base References

- `probability-impact.md` — Risk scoring methodology (1-3 × 1-3 = 1-9)
- `test-priorities-matrix.md` — P0-P3 prioritization: P0=critical path+high risk, P1=important+medium risk, P2=edge cases+low risk

### Related Documents

- Story file: `_bmad-output/implementation-artifacts/2-3-cli-live-status-display.md`
- PRD: FR29-FR32 (CLI status display), NFR1-NFR5 (non-functional reqs)
- Architecture: Observability Pipeline, CLI `--status` specification
- Previous story: 2-2-cross-intent-execution-isolation.md (DispatchContext pattern)

---

**Generated by**: BMad TEA Agent - Test Architect Module
**Workflow**: `bmad-testarch-test-design`
**Version**: 4.0 (BMad v6)
