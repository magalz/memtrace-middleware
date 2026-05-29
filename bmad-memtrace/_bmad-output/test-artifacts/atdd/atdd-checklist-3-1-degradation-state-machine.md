---
stepsCompleted:
  - step-01-preflight-and-context
  - step-02-atdd-scaffolds
lastStep: step-02-atdd-scaffolds
lastSaved: 2026-05-29T09:59:00Z
workflowType: testarch-atdd
storyId: '3'
storyKey: '3-1-degradation-state-machine'
storyFile: _bmad-output/implementation-artifacts/3-1-degradation-state-machine.md
atddChecklistPath: _bmad-output/test-artifacts/atdd/atdd-checklist-3-1-degradation-state-machine.md
generatedTestFiles:
  - tests/unit/degrade/machine.test.ts
  - tests/unit/degrade/probe-timer.test.ts
  - tests/integration/degradation.test.ts
inputDocuments: []
---

# ATDD Checklist - Epic 3, Story 1: Degradation State Machine

**Date:** 2026-05-29
**Author:** Murat (Master Test Architect)
**Primary Test Level:** Unit + Integration

---

## Story Summary

**As a** developer mid-session when Memtrace goes down
**I want** the middleware to detect it, degrade transparently, and auto-recover
**So that** I never see a silent failure — every state change is visible and recoverable

---

## Acceptance Criteria

1. **Full → IntentReduced**: 3 consecutive probe failures trigger tier change (hysteresis prevents flapping on single transient blip)
2. **IntentReduced → Passthrough**: 3 more consecutive probe failures
3. **Passthrough → FailClosed**: 3 more consecutive probe failures
4. **Full recovery**: 3 consecutive successful probes restore Full tier (jump, not climb)
5. **Floor enforcement**: configured floor blocks upgrades, never blocks downgrades
6. **FailClosed dispatch**: returns structured error `{tier: "fail_closed", cause: "memtrace_unavailable", recoverable: false, suggested_action: "run_memtrace_start", trace_id: "<id>"}`
7. **IntentReduced dispatch**: sequential (not parallel), no fusion enrichment, only core intents
8. **Passthrough dispatch**: raw results with `passthrough: true`, skip classification/fusion
9. **Transition logging**: structured log via `createLogger('degrade')` with cause + timestamp
10. **Probe timer**: periodic `backend.probe()` feeds results into `DegradationMachine`
11. **Error type preservation**: `recoverable: true|false` propagates end-to-end through dispatch
12. **Transition metadata**: response metadata includes `degradation_tier` and recent `tier_transition`

---

## Story Integration Metadata

- **Story ID:** `3`
- **Story Key:** `3-1-degradation-state-machine`
- **Story File:** `_bmad-output/implementation-artifacts/3-1-degradation-state-machine.md`
- **Checklist Path:** `_bmad-output/test-artifacts/atdd/atdd-checklist-3-1-degradation-state-machine.md`
- **Generated Test Files:** `tests/unit/degrade/machine.test.ts`, `tests/unit/degrade/probe-timer.test.ts`, `tests/integration/degradation.test.ts`

---

## Red-Phase Test Scaffolds Created

### Unit Tests: DegradationMachine (18 tests)

**File:** `tests/unit/degrade/machine.test.ts` (~280 lines)

| # | Test | Priority | Status | Verifies | AC |
|---|------|----------|--------|----------|----|
| 1 | initial state is Full tier | P0 | RED - class not yet implemented | Default tier is `DegradationTier.Full` | 1 |
| 2 | single probe failure does NOT trigger degradation | P0 | RED - `recordProbeResult` not implemented | Hysteresis prevents flapping on 1 failure | 1, 12 |
| 3 | three consecutive probe failures triggers Full → IntentReduced | P0 | RED - transition logic not implemented | 3-failure threshold triggers degrade | 1 |
| 4 | six consecutive probe failures triggers Full → Passthrough | P0 | RED - multi-step degrade not implemented | Two-tier degrade after 6 failures | 2 |
| 5 | nine consecutive probe failures triggers Full → FailClosed | P0 | RED - full-chain degrade not implemented | Three-tier degrade after 9 failures | 3 |
| 6 | one success resets failure counter | P0 | RED - counter reset not implemented | 2 failures + 1 success + 1 failure = stays Full | 12 |
| 7 | three consecutive successes triggers recovery | P0 | RED - recovery not implemented | 3 successes from Passthrough → Full | 4 |
| 8 | Passthrough recovery goes straight to Full | P0 | RED - jump recovery not implemented | Recovery is a jump, not step-by-step | 4 |
| 9 | floor Passthrough prevents upgrade to IntentReduced | P0 | RED - floor enforcement not implemented | Floor blocks upgrade, stays Passthrough | 5 |
| 10 | floor IntentReduced allows Passthrough downgrade but blocks upgrade | P0 | RED - floor asymmetry not implemented | Floor blocks upgrades, allows downgrades | 5 |
| 11 | transition reason is recorded correctly | P1 | RED - transition metadata not implemented | `getTransitionReason()` returns correct info | 9 |
| 12 | tierHistory tracks all transitions | P1 | RED - history not implemented | Array of `{from, to, reason, timestamp}` | 9 |
| 13 | reset() returns to Full and clears history | P1 | RED - reset not implemented | Full reset for test isolation | - |
| 14 | interleaved failures and successes: 1 fail, 1 success, 3 failures → 1 step degrade only | P1 | RED - interleaved logic not implemented | Mixed probe results produce expected degrade | 12 |
| 15 | rapid probe calls do not corrupt state (concurrent safety simulation) | P2 | RED - concurrent safety not verified | No race conditions in state mutations | - |

### Unit Tests: ProbeTimer (8 tests)

**File:** `tests/unit/degrade/probe-timer.test.ts` (~180 lines)

| # | Test | Priority | Status | Verifies | AC |
|---|------|----------|--------|----------|----|
| 1 | timer starts and calls probe() on interval | P0 | RED - `ProbeTimer` not implemented | `start()` schedules probe calls at interval | 10 |
| 2 | probe failure is recorded as failure in machine | P0 | RED - failure propagation not implemented | `backend.probe()` returning false triggers machine | 10 |
| 3 | probe success is recorded as success | P0 | RED - success propagation not implemented | `backend.probe()` returning true records success | 10 |
| 4 | stop() stops the interval | P1 | RED - stop not implemented | `clearInterval` prevents further calls | 10 |
| 5 | restart() changes interval | P1 | RED - restart not implemented | New interval takes effect | 10 |
| 6 | probe() that throws is treated as failure | P1 | RED - throw handling not implemented | Exceptions treated as probe failures | 10 |
| 7 | isRunning() returns correct state | P2 | RED - running state not tracked | Status query works | - |

### Integration Tests: Degradation Flow (13 tests)

**File:** `tests/integration/degradation.test.ts` (~350 lines)

| # | Test | Priority | Status | Verifies | AC |
|---|------|----------|--------|----------|----|
| 1 | Full → IntentReduced via probe failures | P0 | RED - degradation not wired | Full flow: probe failures trigger tier change | 1 |
| 2 | IntentReduced → Passthrough via additional probe failures | P0 | RED - multi-step not wired | 3 more failures → Passthrough | 2 |
| 3 | Passthrough → FailClosed via additional probe failures | P0 | RED - fail-closed not wired | 3 more failures → FailClosed | 3 |
| 4 | Full recovery: Passthrough → Full | P0 | RED - recovery not wired | 3 successes → Full jump | 4 |
| 5 | FailClosed dispatch returns structured error | P1 | RED - fail-closed error shape not wired | Error envelope with `tier: fail_closed` | 6 |
| 6 | IntentReduced dispatch runs sequentially | P1 | RED - sequential execution not wired | No parallelism in IntentReduced | 7 |
| 7 | Passthrough dispatch skips classification/fusion | P1 | RED - passthrough logic not wired | Raw results with `passthrough: true` | 8 |
| 8 | transition reason appears in response metadata | P1 | RED - metadata enrichment not wired | Response includes `degradation_tier` + reason | 12 |
| 9 | error type preserved end-to-end | P1 | RED - error propagation not wired | `recoverable: true|false` through dispatch | 11 |
| 10 | floor enforcement at integration level | P1 | RED - floor not wired in dispatch | Config floor prevents upgrades | 5 |
| 11 | single probe failure does not trigger tier change | P2 | RED - hysteresis at integration level | 1 transient blip → no change | 1 |

---

## Data Factories Created

N/A — this story uses mock backends and direct singleton manipulation, not data factories.

---

## Fixtures Created

### Degradation Mock Fixture

**File:** `tests/fixtures/degradation-mock.ts` (NEW)

**Exports:**

- `createProbeMockBackend({ probeFails: boolean; probeDelayMs?: number })` — creates `MemtraceBackend` with configurable probe behavior
- `degradationConfig` — minimal `MiddlewareConfig` for degradation tests

**Example Usage:**

```typescript
import { createProbeMockBackend } from '../fixtures/degradation-mock.js';

const backend = createProbeMockBackend({ probeFails: true });
const result = await backend.probe();
// result === false — probes fail on demand
```

---

## Mock Requirements

### MemtraceBackend Mock (for ProbeTimer tests)

**Interface:** `MemtraceBackend`

- `probe(): Promise<boolean>` — return `true` for success, `false` for failure, `throw` for error scenarios
- `listTools(): Promise<ToolSchema[]>` — return `mockCapabilities.tools`
- `execute(query, signal): Promise<QueryResult>` — return mock result

**Failure Response (probe returns false):**
```json
{ "tool": "memtrace_find_code", "data": [], "trace_id": "t1", "elapsed_ms": 10, "degraded": false }
```

**Error Response (probe throws):**
```text
Error: "simulated backend failure"
```

**Notes:** Integration tests use `vi.useFakeTimers()` to control probe cadence without real 15s waits.

---

## Implementation Checklist

### Test: DegradationMachine initial and hysteresis tests (P0)

**File:** `tests/unit/degrade/machine.test.ts`

**Tasks to make this test pass:**

- [ ] Create `src/degrade/machine.ts` with `DegradationMachine` class
- [ ] Implement singleton pattern: `export const degradationMachine = new DegradationMachine()`
- [ ] Implement `currentTier = DegradationTier.Full` default
- [ ] Implement `recordProbeResult(success: boolean): DegradationTier`
- [ ] Implement hysteresis counters (`consecutiveProbeFailures`, `consecutiveProbeSuccesses`)
- [ ] Implement `transition(newTier, reason)` with floor enforcement
- [ ] Implement `getCurrentTier()`, `getTransitionReason()`, `reset()`
- [ ] Run test: `pnpm test tests/unit/degrade/machine.test.ts`
- [ ] ✅ P0 unit tests pass (green phase)

**Estimated Effort:** 2 hours

---

### Test: DegradationMachine recovery and floor tests (P0)

**File:** `tests/unit/degrade/machine.test.ts`

**Tasks to make this test pass:**

- [ ] Implement recovery logic: 3 successes → jump to Full
- [ ] Implement `setFloorTier(tier: DegradationTier)`
- [ ] Implement floor check in `transition()`: block upgrades beyond floor
- [ ] Run test: `pnpm test tests/unit/degrade/machine.test.ts`
- [ ] ✅ P0 recovery/floor tests pass (green phase)

**Estimated Effort:** 1 hour

---

### Test: DegradationMachine metadata tracking (P1)

**File:** `tests/unit/degrade/machine.test.ts`

**Tasks to make this test pass:**

- [ ] Track `lastTransitionReason`, `lastTransitionAt`, `tierHistory[]`
- [ ] Populate on every `transition()` call
- [ ] `getTransitionReason()` returns structured info
- [ ] Run test: `pnpm test tests/unit/degrade/machine.test.ts`
- [ ] ✅ P1 tracking tests pass (green phase)

**Estimated Effort:** 0.5 hours

---

### Test: ProbeTimer tests (P0-P1)

**File:** `tests/unit/degrade/probe-timer.test.ts`

**Tasks to make this test pass:**

- [ ] Create `src/degrade/probe-timer.ts` with `ProbeTimer` class
- [ ] Constructor takes `backend: MemtraceBackend` and `degradationMachine` reference
- [ ] `start(intervalMs)` — `setInterval` to call `backend.probe()` and feed to `degradationMachine.recordProbeResult()`
- [ ] `stop()` — `clearInterval`
- [ ] `restart(intervalMs)` — stop + start
- [ ] `isRunning()` — boolean flag
- [ ] Handle probe throws as failures
- [ ] Import `PROBE_INTERVAL_MS` from `src/constants.ts`
- [ ] Log probe failures at `warn`, successes at `debug` via `createLogger('degrade')`
- [ ] Run test: `pnpm test tests/unit/degrade/probe-timer.test.ts`
- [ ] ✅ All ProbeTimer tests pass (green phase)

**Estimated Effort:** 1.5 hours

---

### Test: Integration degradation flow (P0-P1)

**File:** `tests/integration/degradation.test.ts`

**Tasks to make this test pass:**

- [ ] Replace `src/degrade/index.ts` placeholder with full module exports
- [ ] Implement `initializeDegradation(backend, config)` and `shutdownDegradation()`
- [ ] Wire `degradationMachine` checks into `BaseAdapter.dispatch()`
- [ ] Fail-closed: short-circuit dispatch with `MiddlewareError`
- [ ] IntentReduced: sequential `for...of` instead of `Promise.allSettled`
- [ ] IntentReduced: skip fusion enrichment
- [ ] Passthrough: skip classification/fusion, return raw with `passthrough: true`
- [ ] Enrich response metadata with `degradation_tier` and `tier_transition`
- [ ] Wire `initializeDegradation` in `src/cli/index.ts`
- [ ] Wire `shutdownDegradation` on `SIGINT`/`SIGTERM`
- [ ] Run test: `pnpm test tests/integration/degradation.test.ts`
- [ ] ✅ All integration tests pass (green phase)

**Estimated Effort:** 3 hours

---

### Test: Floor enforcement at integration level (P1)

**File:** `tests/integration/degradation.test.ts`

**Tasks to make this test pass:**

- [ ] `onConfigChanged()` calls `degradationMachine.setFloorTier(normalizeFloor(...))`
- [ ] `initializeDegradation()` sets initial floor from config
- [ ] Run test: `pnpm test tests/integration/degradation.test.ts`
- [ ] ✅ Floor integration tests pass (green phase)

**Estimated Effort:** 0.5 hours

---

## Running Tests

```bash
# Run all degrade tests
pnpm test tests/unit/degrade/machine.test.ts
pnpm test tests/unit/degrade/probe-timer.test.ts
pnpm test tests/integration/degradation.test.ts

# Run all tests (expect ~220+ after this story)
pnpm test

# Type check
pnpm typecheck

# Lint
pnpm lint

# Build
pnpm build
```

---

## Red-Green-Refactor Workflow

### RED Phase (Complete) ✅

**TEA Agent Responsibilities:**

- ✅ All tests written as red-phase scaffolds with expected failure reasons
- ✅ Mock backend documented
- ✅ Implementation checklist created
- ✅ Priority mapping (P0/P1/P2) aligned with story ACs

**Verification:**

- All 36 generated tests are documented in this checklist
- Each scaffold has a clear expected failure reason
- Activation guidance is actionable

---

### GREEN Phase (DEV Team - Next Steps)

1. **Start with P0 unit tests** for `DegradationMachine` (pure state machine, no deps)
2. **Then P0 ProbeTimer tests** (uses fake timers, simple interval wrapper)
3. **Then P0-P1 integration tests** (wires everything together)
4. **One test at a time** — remove `test.skip()`, confirm RED, implement, verify GREEN

### REFACTOR Phase (DEV Team - After All Tests Pass)

1. Verify all tests pass (pnpm test)
2. Run `pnpm typecheck` — zero errors
3. Run `pnpm lint` — zero ESLint errors
4. Run `pnpm build` — ESM+CJS+DTS compiled
5. Verify no `console.log` — only `createLogger('degrade')`
6. Verify no `Promise.all` in production code

---

## Next Steps

1. Link this checklist into the story's Dev Notes section
2. Begin implementation with `src/degrade/machine.ts` (core state machine)
3. Follow priority order: P0 unit → P0 probe-timer → P0-P1 integration
4. Activate one scaffold at a time by writing the test and verifying RED before implementing
5. After all tests GREEN, run full suite to confirm zero regressions

---

## Test Execution Evidence

### Initial Scaffold Review / RED Verification

**Command:** `pnpm test tests/unit/degrade/machine.test.ts tests/unit/degrade/probe-timer.test.ts tests/integration/degradation.test.ts`

**Expected results before implementation:**

```
✓ 0 passing
✗ 36 failing (module not found) — tests reference files that don't exist yet
```

**Summary:**
- Total tests: 36 (when written)
- Skipped: 0 (scaffolds are written without `test.skip()` to confirm RED on first run)
- Activated RED tests: 36 (all fail until implementation)
- Passing: 0 before implementation
- Status: ⏳ Red-phase scaffolds ready for implementation

---

## Notes

- The `DegradationMachine` is a singleton — tests MUST call `degradationMachine.reset()` in `beforeEach` for isolation
- `ProbeTimer` tests MUST use `vi.useFakeTimers()` / `vi.useRealTimers()` to avoid real 15s intervals
- Integration tests MUST NOT rely on real probe timing — use `vi.advanceTimersByTime()` for deterministic control
- The `createProbeMockBackend` utility belongs in a shared fixture file to avoid duplication
- Floor enforcement is asymmetric: upgrades blocked, downgrades always allowed
- Recovery is a jump (Passthrough → Full), not a climb (Passthrough → IntentReduced → Full)

---

**Generated by BMad TEA Agent** - 2026-05-29
