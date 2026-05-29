# Test Design: Story 2.2 — Cross-Intent Execution Isolation

**Date:** 2026-05-29
**Author:** Magal
**Status:** Draft

---

## Executive Summary

**Scope:** Epic-Level test design for Story 2.2 (Epic 2: Context Fusion & Injection)

**Risk Summary:**

- Total risks identified: 5
- High-priority risks (≥6): 2
- Critical categories: TIMER (timer leak/GC), DATA (state contamination)

**Coverage Summary:**

- P0 scenarios: 13 tests (~4-6 hours)
- P1 scenarios: 5 tests (~2-3 hours)
- P2/P3 scenarios: 3 tests (~1-2 hours)
- **Total effort**: 21 tests (~7-11 hours)

---

## Not in Scope

| Item | Reasoning | Mitigation |
| ---- | --------- | ---------- |
| **E2E / Browser tests** | Backend-only TypeScript library — no UI | All coverage at Unit + Integration levels |
| **Performance benchmarks** | Dispatch isolation is a structural guarantee, not a performance feature | Timer cleanup tests verify no lingering references; GC test is P2 optional |
| **Process-level isolation** | Single-process by design per architecture | Session tracking on BaseAdapter is per-instance and correct — not in scope |
| **Session-level isolation across restarts** | Architecture explicitly out of scope for this story | Noted in story file — Story 2.2 is dispatch-level only |
| **DEDUP_CACHE_TTL_MS enforcement** | Reserved for future per-dispatch LRU cache | Noted in story as Not Covered |

---

## Risk Assessment

### High-Priority Risks (Score ≥6)

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner | Timeline |
| ------- | -------- | ----------- | ----------- | ------ | ----- | ---------- | ----- | -------- |
| R-001 | DATA | **State contamination**: dispatch A's error flags, partial cache entries, or degraded state persist and affect dispatch B's results — violates FR22 isolation guarantee | 2 | 3 | 6 | `DispatchContext` as per-dispatch bag with `cleanupContext()` in `finally` block; unit tests verify fresh state per call; integration tests verify sequential + concurrent isolation | DEV | Pre-DS |
| R-002 | PERF | **Timer/controller leak**: `setTimeout` callbacks or `AbortController` references survive dispatch completion, causing dangling timers that fire on stale controllers — memory leak and potential side effects on subsequent dispatches | 2 | 3 | 6 | Centralized timer tracking in `DispatchContext.activeTimers`; `cleanupContext()` clears all timers and aborts all controllers; unit tests verify cleanup is exhaustive | DEV | Pre-DS |

### Medium-Priority Risks (Score 3-4)

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner |
| ------- | -------- | ----------- | ----------- | ------ | ----- | ---------- | ----- |
| R-003 | DATA | **Concurrent race condition**: two dispatches running simultaneously on the same adapter instance share a mutable reference (module-level state) causing corrupted results or cross-dispatch errors | 2 | 2 | 4 | `runDispatch()` receives `DispatchContext` as parameter (not stored on `this`); no module-level mutable state allowed; integration tests with `Promise.all` verify isolation | DEV |
| R-004 | TECH | **Partial cleanup on exception**: a thrown error during dispatch skips the cleanup block, leaving dangling timers/controllers that leak until GC or cause side effects on next dispatch | 2 | 2 | 4 | Cleanup in `finally` block (not `catch`) guarantees execution regardless of success or failure; unit tests verify cleanup after simulated errors | DEV |

### Low-Priority Risks (Score 1-2)

| Risk ID | Category | Description | Probability | Impact | Score | Action |
| ------- | -------- | ----------- | ----------- | ------ | ----- | ------ |
| R-005 | DATA | **trace_id collision**: two dispatches on the same adapter generate identical trace IDs, breaking observability and dedup tracking | 1 | 2 | 2 | Unit test verifies unique trace_id per `createDispatchContext()` call; integration tests verify different trace_ids between sequential A and B |

### Risk Category Legend

- **TECH**: Technical/Architecture (flaws, integration, scalability)
- **SEC**: Security (access controls, auth, data exposure)
- **PERF**: Performance (SLA violations, degradation, resource limits)
- **DATA**: Data Integrity (loss, corruption, inconsistency)
- **TIMER**: Resource Leak / Timer Safety (dangling references, GC)
- **BUS**: Business Impact (UX harm, logic errors, revenue)
- **OPS**: Operations (deployment, config, monitoring)

---

## NFR Planning

**Purpose:** Capture story-specific NFR thresholds and planned validation for later `nfr-assess`.

| NFR Category | Requirement / Threshold | Risk Link | Planned Validation | Evidence Needed |
| ------------ | ----------------------- | --------- | ------------------ | --------------- |
| Reliability | FR22 isolation: no shared mutable state between dispatches — A's timeout/error never affects B | R-001, R-003 | Integration tests: sequential timeout + sequential error + concurrent dispatches all verify isolation | Test report with all isolation tests passing |
| Resource Safety | All `setTimeout` IDs cleared and `AbortController` references released after each dispatch | R-002, R-004 | Unit tests: `cleanupContext()` clears timers and aborts controllers; `finally` block execution verified | Test report with cleanup coverage |
| Reliability | `finally` block guaranteed execution — cleanup runs on success, error, and timeout | R-004 | Unit tests: simulated success, error, and timeout all trigger cleanup | Test report with finally-block coverage |
| Observability | Each dispatch has unique traceId | R-005 | Unit test: unique traceId per call; integration test: different traceIds between A and B | Test report with traceId uniqueness verified |

**Unknown thresholds:** None — all story-level NFRs are structural isolation guarantees, not performance thresholds. No latency/throughput NFRs are in scope for this defensive hardening story.

---

## Entry Criteria

- [x] Story 2.2 approved with clear acceptance criteria (6 ACs)
- [ ] Test framework configured: vitest in `vitest.config.ts` — verified
- [ ] Existing test patterns loaded: Given-When-Then, `[P0-P2]` priorities, vitest `describe`/`it`/`expect`
- [ ] Existing fixtures available: `createMockMemtrace`, `buildIntent`, `mockCapabilities`
- [x] BaseAdapter `runDispatch()` has local mutable state to extract into DispatchContext (pre-existing code)

## Exit Criteria

- [ ] All P0 tests passing (13 tests)
- [ ] All P1 tests passing (5 tests — failures triaged if needed)
- [ ] No open high-priority risks (R-001, R-002 mitigations verified)
- [ ] Test coverage: 100% AC coverage via traceability matrix
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm build` all pass with zero errors

---

## Test Coverage Plan

### P0 (Critical) — Run on every commit

**Criteria:** Blocks core journey + High risk (≥6) + No workaround

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| ----------- | ---------- | --------- | ---------- | ----- | ----- |
| AC 1 — createDispatchContext returns all required fields | Unit | R-001 | 1 | DEV | traceId, dispatchStart, activeTimers, activeControllers, errors, hasDegraded, dedupCache |
| AC 1 — Unique traceId per call | Unit | R-005 | 1 | DEV | Two consecutive calls produce different traceId |
| AC 1 — Empty timers/controllers on creation | Unit | R-001 | 1 | DEV | activeTimers and activeControllers are empty Sets |
| AC 1 — Clean error state on creation | Unit | R-001 | 1 | DEV | errors empty, hasDegraded false |
| AC 4 — cleanupContext clears all timers | Unit | R-002 | 1 | DEV | Timer cleared, activeTimers empty |
| AC 4 — cleanupContext aborts all controllers | Unit | R-002 | 1 | DEV | Controller aborted, activeControllers empty |
| AC 4 — cleanupContext is idempotent | Unit | R-004 | 1 | DEV | Double cleanup does not throw |
| AC 4 — cleanupContext on empty context safe | Unit | R-004 | 1 | DEV | Cleanup on fresh context does not throw |
| AC 2,5 — Sequential timeout isolation | Integration | R-001 | 1 | DEV | A times out → B returns valid result, no contamination |
| AC 3,6 — Concurrent isolation | Integration | R-003 | 1 | DEV | Promise.all(find_code, get_symbol_context) → independent results |
| AC 2,5 — Sequential error contamination | Integration | R-001 | 1 | DEV | A returns error → B returns valid result |
| AC 3 — Concurrent valid AgentResponse shape | Integration | R-003 | 1 | DEV | Both dispatches return well-formed AgentResponse |
| AC 2 — trace_id differs between A and B | Integration | R-005 | 1 | DEV | Sequential A and B have different trace_ids |

**Total P0**: 13 tests, ~4-6 hours

### P1 (High) — Run on PR to main

**Criteria:** Important features + Medium risk (3-4) + Common workflows

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| ----------- | ---------- | --------- | ---------- | ----- | ----- |
| AC 1 — Timer registration and auto-removal | Unit | R-002 | 1 | DEV | Register timer → resolve → removed from activeTimers |
| AC 1 — Controller registration and auto-removal | Unit | R-002 | 1 | DEV | Register controller → resolve → removed from activeControllers |
| AC 2 — B's metadata clean after A's timeout | Integration | R-001 | 1 | DEV | No error flags or degraded state in B's response |
| AC 6 — Both concurrent returns valid shape | Integration | R-003 | 1 | DEV | Both results have valid AgentResponse shape |
| AC 2 — Sequential isolation scenario | Integration | R-001 | 1 | DEV | Full sequential test: A timeout → B valid |

**Total P1**: 5 tests, ~2-3 hours

### P2 (Medium) — Run nightly/weekly

**Criteria:** Secondary features + Low risk (1-2) + Edge cases

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| ----------- | ---------- | --------- | ---------- | ----- | ----- |
| AC 1 — Custom traceId support | Unit | R-005 | 1 | DEV | Optional traceId parameter accepted |
| AC 1 — dedupCache is fresh Map per context | Unit | R-001 | 1 | DEV | Two contexts have independent dedupCaches |
| AC 1 — Errors array appends correctly | Unit | R-001 | 1 | DEV | ctx.errors accumulates; isolation verified |
| AC 1 — hasDegraded toggles per context | Unit | R-001 | 1 | DEV | Setting on ctx A does not affect ctx B |
| AC 4 — AbortController leakage (optional) | Integration | R-002 | 1 | DEV | 50 sequential dispatches; no memory growth |

**Total P2**: 5 tests, ~1-2 hours

---

## Execution Strategy

### Smoke Tests (<2 min)

**Purpose:** Fast feedback — catch build-breaking issues

- [ ] All unit DispatchContext tests pass (14 tests — ~30s)

**Total**: 1 test suite

### P0 Tests (<5 min)

**Purpose:** Critical path validation

- [ ] DispatchContext creation and field presence (4 unit tests)
- [ ] Cleanup: timer clearing, controller aborting, idempotency (4 unit tests)
- [ ] Sequential timeout isolation (1 integration test)
- [ ] Concurrent isolation (1 integration test)
- [ ] Sequential error contamination (1 integration test)
- [ ] Response shape and trace_id uniqueness (2 tests)

**Total**: 13 scenarios

### P1 Tests (<5 min)

**Purpose:** Important feature coverage

- [ ] Timer/controller auto-removal (2 unit tests)
- [ ] Metadata isolation + scenario replication (3 integration tests)

**Total**: 5 scenarios

### P2 Tests (<3 min)

**Purpose:** Edge case coverage

- [ ] dedupCache, custom traceId, error/degraded isolation (4 unit tests)
- [ ] Optional GC/memory leakage test (1 integration test)

**Total**: 5 scenarios

---

## Resource Estimates

### Test Development Effort

| Priority | Count | Hours/Test | Total Hours | Notes |
| -------- | ----- | ---------- | ----------- | ----- |
| P0 | 13 | — | ~4-6h | DispatchContext creation + cleanup + integration isolation scenarios |
| P1 | 5 | — | ~2-3h | Auto-removal wiring, metadata isolation |
| P2 | 5 | — | ~1-2h | Edge cases, dedupCache, optional memory test |
| **Total** | **21** | **—** | **~7-11h** | **~1-2 days** |

### Prerequisites

**Test Data:**
- `createDispatchContext()` and `cleanupContext()` factory functions — defined in source code under test
- `buildIntent()` from `tests/helpers/test-utils.ts` — reusable fixture for integration tests
- `createMockMemtrace({ failureMode, delayMs, slowTools })` from `tests/fixtures/memtrace-mock.ts` — timeout/error simulation

**Tooling:**
- `vitest` for all test execution — pre-configured in `vitest.config.ts`
- Node.js `AbortController` and `setTimeout`/`clearTimeout` — native runtime, no dependencies

**Environment:**
- Node.js >= 20 (project requirement)
- Standard dev environment (no special setup needed)

---

## Quality Gate Criteria

### Pass/Fail Thresholds

- **P0 pass rate**: 100% (no exceptions)
- **P1 pass rate**: ≥95% (waivers required for failures)
- **P2 pass rate**: ≥90% (informational)
- **High-risk mitigations**: 100% complete or approved waivers

### Coverage Targets

- **Critical paths (isolation guarantees)**: 100% (R-001, R-002)
- **Cleanup scenarios (timer/controller lifecycle)**: 100%
- **Integration scenarios (sequential + concurrent)**: 100% of AC 2, 3, 5, 6
- **Edge cases (idempotent cleanup, empty context)**: ≥50%

### Non-Negotiable Requirements

- [ ] All P0 tests pass
- [ ] No high-risk (≥6) items unmitigated (R-001, R-002)
- [ ] Timer cleanup verified — no `setTimeout` fires after `cleanupContext()`
- [ ] AbortController cleanup verified — no controller survives `cleanupContext()`
- [ ] `finally` block pattern confirmed in `dispatch()` — cleanup runs on all paths

---

## Mitigation Plans

### R-001: State contamination (Score: 6)

**Mitigation Strategy:** `DispatchContext` formalized as per-dispatch bag passed to `runDispatch()` — never stored on `this`. Fresh instance created per `dispatch()` call. `cleanupContext()` in `finally` block clears all state. Unit tests verify fresh empty state; integration tests verify sequential and concurrent isolation with mock backends.

**Owner:** DEV
**Timeline:** Pre-DS (before implementation)
**Status:** Planned
**Verification:** `dispatch-context.test.ts` creation + empty-state tests pass; `isolation.test.ts` sequential + concurrent tests pass

### R-002: Timer/controller leak (Score: 6)

**Mitigation Strategy:** All `setTimeout` IDs and `AbortController` instances registered in `DispatchContext.activeTimers`/`activeControllers`. `cleanupContext()` iterates both Sets: `clearTimeout` for each timer, `.abort()` for each controller. Unit tests verify exhaustive cleanup; integration tests verify no lingering references after dispatch.

**Owner:** DEV
**Timeline:** Pre-DS (before implementation)
**Status:** Planned
**Verification:** `dispatch-context.test.ts` cleanup tests pass; `isolation.test.ts` AbortController leakage test passes (optional GC test)

### R-003: Concurrent race condition (Score: 4)

**Mitigation Strategy:** `runDispatch()` receives `DispatchContext` as explicit parameter — no shared mutable state on `this`. Code review confirms no module-level variables beyond readonly constructor fields. Integration test with `Promise.all` firing concurrent dispatches verifies isolation.

**Owner:** DEV
**Timeline:** During DS
**Status:** Planned
**Verification:** `isolation.test.ts` concurrent test passes; code review confirms no shared mutable state

### R-004: Partial cleanup on exception (Score: 4)

**Mitigation Strategy:** Cleanup placed in `finally` block (not `catch`) in `dispatch()`. Unit tests verify cleanup executes after simulated success, error, and timeout scenarios.

**Owner:** DEV
**Timeline:** During DS
**Status:** Planned
**Verification:** `dispatch-context.test.ts` cleanup tests cover all exit paths; code review confirms `try/finally` pattern

### R-005: trace_id collision (Score: 2)

**Mitigation Strategy:** `createDispatchContext()` generates unique traceId per call (crypto-random or timestamp-based). Unit test verifies uniqueness; integration test verifies different trace_ids between sequential dispatches.

**Owner:** DEV
**Timeline:** During DS
**Status:** Planned
**Verification:** `dispatch-context.test.ts` traceId uniqueness test passes; `isolation.test.ts` trace_id differ test passes

---

## Assumptions and Dependencies

### Assumptions

1. `AbortController` and `setTimeout`/`clearTimeout` are available in Node.js >= 20 runtime (project requirement)
2. `createMockMemtrace()` failure modes are sufficient to simulate timeout and error scenarios for integration tests
3. The existing `runDispatch()` local variables (errors[], hasDegraded, per-query AbortControllers) already work correctly per-call — DispatchContext formalizes this without changing behavior
4. The fusion engine's `deduplicate()` creates a new `Map` per call — already safe. DispatchContext's dedupCache is defense-in-depth

### Dependencies

1. Story 2.1 (Fusion Engine) — must provide stable `fuse()` and `validateContext()` that this story's dispatch orchestration consumes (verified: complete)
2. `src/types.ts` — must export `ErrorCause` including `'intent_timeout'`, `'classification_failed'` (verified: already exported)
3. `tests/fixtures/memtrace-mock.ts` — must support `failureMode` and `slowTools` for timeout/error simulation (verified: already supported)

### Risks to Plan

- **Risk**: `runDispatch()` refactoring reveals hidden module-level mutable state beyond the mentioned local variables
  - **Impact**: More refactoring surface than estimated; additional isolation tests needed
  - **Contingency**: AC 2.6 mandates verification of NO module-level mutable state — if found, escalate to task 2.6 scope expansion

---

## Interworking & Regression

| Service/Component | Impact | Regression Scope |
| ----------------- | ------ | ---------------- |
| **BaseAdapter** (`src/interface/base-adapter.ts`) | `runDispatch()` refactored to accept `DispatchContext` parameter; `dispatch()` gets `try/finally` with `cleanupContext()` | Existing `base-adapter-orchestration.test.ts` — all 6 tests must still pass |
| **Fusion engine** (`src/fusion/engine.ts`) | No change — pure function, already safe | No regression scope |
| **Integration tests** (`transport-roundtrip.test.ts`) | New `isolation.test.ts` added | All existing integration tests continue unchanged |
| **Barrel exports** (`src/index.ts`) | May export `DispatchContext` type if made public | New type export reviewed for public API stability |

---

## Appendix

### Knowledge Base References

- `risk-governance.md` — Risk classification framework
- `probability-impact.md` — Risk scoring methodology (1-3 scale)
- `test-levels-framework.md` — Test level selection (Unit/Integration for backend)
- `test-priorities-matrix.md` — P0-P3 prioritization rules

### Related Documents

- Story: `_bmad-output/implementation-artifacts/2-2-cross-intent-execution-isolation.md`
- Architecture: `planning-artifacts/architecture.md` (Cross-Intent Isolation, line 61; State Isolation, lines 436-439)
- PRD: `planning-artifacts/prd.md` (FR22, NFR18; Cross-intent state contamination risk, line 321)
- ATDD Checklist: `_bmad-output/test-artifacts/atdd/atdd-checklist-2-2-cross-intent-execution-isolation.md`

### Follow-on Workflows (Manual)

- Run `*atdd` to generate failing P0 tests (separate workflow; not auto-run).
- Run `*automate` for broader coverage once implementation exists.

---

**Generated by**: BMad TEA Agent — Test Architect Module
**Workflow**: `bmad-testarch-test-design`
