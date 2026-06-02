---
workflowStatus: 'complete'
totalSteps: 5
stepsCompleted: [1, 2, 3, 4, 5]
lastStep: '05'
nextStep: ''
lastSaved: '2026-06-02T14:10:00Z'
---

# Test Design: Epic 5, Story 6 — Adapter Hardening

**Date:** 2026-06-02
**Author:** Magal
**Status:** Draft

---

## Executive Summary

**Scope:** Story-level test design for 5-6-adapter-hardening — hardening the v1 Memtrace adapter layer against child process listener leaks, unsafe error property access, and QA gate coupling.

**Risk Summary:**

- Total risks identified: 5
- High-priority risks (>=6): 2
- Critical categories: TECH (memory leaks), DATA (silent failures)

**Coverage Summary:**

- P0 scenarios: 5 (1.5 hours)
- P1 scenarios: 6 (1.0 hours)
- P2 scenarios: 4 (0.5 hours)
- **Total effort**: 3.0 hours (~0.5 days)

---

## Not in Scope

| Item | Reasoning | Mitigation |
| ---- | --------- | ---------- |
| **E2E browser tests** | Adapter is CLI tool, no UI | N/A |
| **Performance/load testing** | Adapter is a thin proxy; latency is Memtrace backend responsibility | Monitored via CI regression |
| **New mock server features** | `memtrace-mock.mjs` is feature-complete for current needs | Existing mock covers all scenarios |
| **Middleware (`bmad-memtrace/`)** | This story targets the v1 adapter (`_bmad/scripts/memtrace/`), not the middleware | Separate epic |

---

## Risk Assessment

### High-Priority Risks (Score >=6)

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner | Timeline |
| ------- | -------- | ----------- | ----------- | ------ | ----- | ---------- | ----- | -------- |
| R-001 | TECH | Child process listener leak in `McpClient.spawn()` causes memory accumulation over long-running processes (CI, agent loops) | 3 | 3 | **9** | Add stdout/stderr `removeListener` to `cleanup()` closure + regression test | Dev | Story 5.6 |
| R-002 | DATA | Unsafe `.message` access on non-Error caught values produces `TypeError` or silent `undefined`, masking root cause in error logs | 2 | 3 | **6** | Replace all 11 occurrences with `err?.message ?? String(err)` + defensive test | Dev | Story 5.6 |

### Medium-Priority Risks (Score 3-4)

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner |
| ------- | -------- | ----------- | ----------- | ------ | ----- | ---------- | ----- |
| R-003 | TECH | QA gate breaks silently when adapter renames output fields — gate passes/fails incorrectly with stale field names | 2 | 2 | **4** | Normalizer layer in `qa-memtrace.mjs` decouples `compute()` from raw adapter field names | Dev |
| R-004 | TECH | `sendRequest` error path (line 249 catch) does not clean up queued request from `_activeRequests` | 1 | 2 | **2** | Accepted risk — cleanup handled at lifecycle boundaries (`kill()`/`shutdown()`); documented in Dev Notes | Dev |

### Low-Priority Risks (Score 1-2)

| Risk ID | Category | Description | Probability | Impact | Score | Action |
| ------- | -------- | ----------- | ----------- | ------ | ----- | ------ |
| R-005 | OPS | Existing mock tests (`memtrace-mock.mjs`) break due to `McpClient` internal refactoring | 1 | 2 | **2** | All 44 existing adapter tests + 14 QA tests are regression gate |

### Risk Category Legend

- **TECH**: Technical/Architecture (flaws, integration, scalability)
- **SEC**: Security (access controls, auth, data exposure)
- **PERF**: Performance (SLA violations, degradation, resource limits)
- **DATA**: Data Integrity (loss, corruption, inconsistency)
- **BUS**: Business Impact (UX harm, logic errors, revenue)
- **OPS**: Operations (deployment, config, monitoring)

---

## NFR Planning

**Purpose:** Capture story-specific NFR thresholds.

| NFR Category | Requirement / Threshold | Risk Link | Planned Validation | Evidence Needed |
| ------------ | ----------------------- | --------- | ------------------ | --------------- |
| Reliability | Zero memory leaks from McpClient lifecycle | R-001 | Unit test: listener count == 0 after error/exit/spawn failure | Test pass + `listenerCount()` assertion |
| Maintainability | Safe error access everywhere — no bare `.message` | R-002 | Grep audit for bare `.message` on catch variables + unit test with non-Error values | Zero grep hits + test pass |
| Maintainability | QA gate survives adapter field renames | R-003 | Normalizer unit test with current and evolved adapter formats | Test pass on both formats |

**Unknown thresholds:** None — all thresholds are verifiable at the unit test level.

---

## Entry Criteria

- [x] Story 5.6 spec complete with line-level analysis in Dev Notes
- [x] Existing test suite (44 adapter + 14 QA) is green baseline
- [x] Memtrace mock server (`memtrace-mock.mjs`) available for adapter tests
- [x] Node.js >= 20 (native test runner support)

## Exit Criteria

- [ ] All new unit tests pass (listener leak + safe access + normalizer)
- [ ] All existing 44 adapter tests pass (no regression)
- [ ] All existing 14 QA tests pass (no regression)
- [ ] E2E smoke: `node memtrace-adapter.mjs --query list_repos` exit 0, valid JSON
- [ ] Zero bare `.message` accesses on catch variables (grep audit)
- [ ] Story file status updated to `review`

---

## Test Coverage Plan

### P0 (Critical) — Run on every commit (via `node:test`)

**Criteria:** Blocks core function + High risk (>=6) + No workaround

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| ----------- | ---------- | --------- | ---------- | ----- | ----- |
| Child process listener cleanup on spawn error | Unit | R-001 | 2 | Dev | `McpClient` spawn ENOENT + mid-request error cleanup |
| Safe `.message` access on non-Error values | Unit | R-002 | 3 | Dev | null, string, undefined error values |
| Regression: all existing tests pass | Unit | R-005 | 1 | Dev | Run full suite — 44 adapter + 14 QA tests |

**Total P0**: 6 tests, 1.5 hours

### P1 (High) — Run on PR to main

**Criteria:** Important features + Medium risk (3-4) + Common workflows

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| ----------- | ---------- | --------- | ---------- | ----- | ----- |
| QA normalizer maps `affected_symbols` → symbols | Unit | R-003 | 1 | Dev | Normalizer function test |
| QA normalizer handles missing fields (graceful degradation) | Unit | R-003 | 1 | Dev | Empty/malformed adapter output |
| QA normalizer maps `module` → path | Unit | R-003 | 1 | Dev | Coverage data normalization |
| QA `compute()` uses normalized shapes | Unit | R-003 | 2 | Dev | End-to-end: current + evolved formats |
| Adapter E2E smoke (real/mock Memtrace) | Integration | R-005 | 1 | Dev | `--query list_repos`, `--batch`, `--help` |

**Total P1**: 6 tests, 1.0 hours

### P2 (Medium) — Run nightly/weekly

**Criteria:** Secondary features + Low risk (1-2) + Edge cases

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| ----------- | ---------- | --------- | ---------- | ----- | ----- |
| `sendRequest` error path behavior (no listener leak documented) | Unit | R-004 | 1 | Dev | Verify _activeRequests cleared at lifecycle |
| `shutdown()`/`kill()` listener cleanup verified (existing pattern) | Unit | - | 1 | Dev | Regression test for already-correct paths |
| `err?.code` safe access on process errors | Unit | R-002 | 1 | Dev | `err?.code === 'ENOENT'` etc. |
| Grep audit: zero bare `.message` on catch variables | Static | R-002 | 1 | Dev | `rg 'err\.message'` on adapter + QA files |

**Total P2**: 4 tests, 0.5 hours

---

## Execution Order

### Smoke Tests (<2 min)

**Purpose:** Fast feedback after each code change

- [ ] `node --test _bmad/scripts/memtrace/memtrace-adapter.test.mjs --test-name-pattern="listener"` (30s)
- [ ] `node --test _bmad/scripts/memtrace/memtrace-adapter.test.mjs --test-name-pattern="message"` (30s)
- [ ] `node --test _bmad/scripts/memtrace/qa-memtrace.test.mjs --test-name-pattern="normal"` (30s)

**Total**: 3 scenarios

### P0 Tests (<5 min)

- [ ] Full adapter test suite: `node --test _bmad/scripts/memtrace/memtrace-adapter.test.mjs`
- [ ] Null/string/undefined error handling tests
- [ ] Listener count verification tests

**Total**: 3 scenarios

### P1 Tests (<10 min)

- [ ] Full QA test suite: `node _bmad/scripts/memtrace/qa-memtrace.test.mjs`
- [ ] Normalizer tests (current + evolved formats)
- [ ] Adapter E2E smoke with mock

**Total**: 3 scenarios

### P2 Tests (<15 min)

- [ ] Grep audit script
- [ ] Existing regression suite full run

**Total**: 2 scenarios

---

## Resource Estimates

### Test Development Effort

| Priority | Count | Hours/Test | Total Hours | Notes |
| -------- | ----- | ---------- | ----------- | ----- |
| P0 | 6 | 0.25 | 1.5 | Critical fixes — small count, high value |
| P1 | 6 | 0.17 | 1.0 | Normalizer + integration smoke |
| P2 | 4 | 0.13 | 0.5 | Edge cases + static audit |
| **Total** | **16** | **-** | **3.0** | **~0.5 days** |

### Prerequisites

**Test Data:**
- `makeMockChild()` factory — already exists in test suite
- `makeBlastData()` / `makeEvolvedBlastData()` — inline helper in new tests
- No external data factories needed

**Tooling:**
- Node.js >= 20 (`node:test` native runner)
- `node:assert/strict` for assertions
- `rg` (ripgrep) for bare `.message` grep audit

**Environment:**
- Local Node.js installation (no containers, no CI required)
- `MEMTRACE_MOCK_PATH` env var for adapter tests (or real Memtrace instance)

---

## Quality Gate Criteria

### Pass/Fail Thresholds

- **P0 pass rate**: 100% (no exceptions)
- **P1 pass rate**: 100% (all must pass)
- **P2 pass rate**: >=75% (static audit informational)
- **Regression pass rate**: 100% (all 58 existing tests)

### Coverage Targets

- **AC1 (listener leak)**: 4 tests — 100% AC covered
- **AC2 (safe access)**: 3 tests + grep audit — 100% AC covered
- **AC3 (QA coupling)**: 5 tests (normalizer + compute) — 100% AC covered

### Non-Negotiable Requirements

- [ ] All 3 ACs must have >=1 passing test
- [ ] Zero bare `.message` on catch variables
- [ ] `McpClient` public API signatures unchanged
- [ ] All mock env vars (`MEMTRACE_MOCK_*`) continue functioning

---

## Mitigation Plans

### R-001: Child Process Listener Leak (Score: 9)

**Mitigation Strategy:** Add `removeListener` for stdout/stderr data events to the `cleanup()` closure in `McpClient.spawn()`. Pattern matches existing correct behavior in `shutdown()` and `kill()`. Wrap in try/catch for safety.

**Owner:** Dev
**Timeline:** Story 5.6
**Status:** Planned
**Verification:** Unit test: `child.stdout.listenerCount('data') === 0` after `error` event. Grep for `_onStdoutData` / `_onStderrData` to confirm only `cleanup()`/`shutdown()`/`kill()` attach them.

### R-002: Unsafe `.message` Access (Score: 6)

**Mitigation Strategy:** Replace all 11 occurrences of `err.message` / `serializeErr.message` / `diagErr.message` with `err?.message ?? String(err)`. Add dedicated unit test passing non-Error values through the catch paths. Grep audit to confirm zero bare `.message` remain.

**Owner:** Dev
**Timeline:** Story 5.6
**Status:** Planned
**Verification:** Unit test with `null`, `"string error"`, `undefined`. Grep for `err\.message` (no `?`) on error variables.

---

## Assumptions and Dependencies

### Assumptions

1. Real Memtrace instance OR mock server available for adapter integration tests.
2. Node.js >= 20.0.0 available in dev environment.
3. `node:test` CLI supports `--test-name-pattern` for targeted test runs.
4. Existing 44 adapter tests + 14 QA tests are green before any changes.

### Dependencies

1. `memtrace-mock.mjs` — must remain functional. No changes needed from this story.
2. `makeMockChild()` test helper — must remain compatible after `McpClient` changes.

### Risks to Plan

- **Risk**: `McpClient` internal refactoring breaks mock compatibility
  - **Impact**: Cannot run adapter tests without real Memtrace
  - **Contingency**: Minimal refactoring — only add removeListener calls, no structural changes

---

## Interworking & Regression

| Service/Component | Impact | Regression Scope |
| ----------------- | ------ | ---------------- |
| **`memtrace-adapter.mjs`** | `McpClient.spawn()`, error catch paths modified | All 44 existing adapter tests |
| **`qa-memtrace.mjs`** | `compute()` refactored with normalizer, error catch fixed | All 14 existing QA tests |
| **`memtrace-mock.mjs`** | No changes | Mock must still serve all test scenarios |
| **CLI adapter** | No public API change | `--help`, `--query`, `--batch`, timeout token |

---

## Follow-on Workflows (Manual)

- Run `bmad-testarch-test-review` after implementation to score test quality
- Run `bmad-testarch-trace` to verify AC-to-test traceability
- Run `bmad-testarch-automate` to fill coverage gaps if any
- Run `bmad-code-review` for adversarial review before merge

---

## Approval

**Test Design Approved By:**

- [ ] Product Manager: Date:
- [ ] Tech Lead: Date:
- [ ] QA Lead: Date:

**Comments:**

---

**Generated by**: BMad Dev Story (QA-Design Phase) — Test Design
**Workflow**: `bmad-testarch-test-design`
**Version**: 1.0
