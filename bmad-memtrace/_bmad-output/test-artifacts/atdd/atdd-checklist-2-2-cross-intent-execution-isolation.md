---
stepsCompleted:
  - step-01-preflight-and-context
  - step-02-generation-mode
  - step-03-test-strategy
  - step-04-generate-tests
  - step-04c-aggregate
  - step-05-validate-and-complete
lastStep: step-05-validate-and-complete
lastSaved: 2026-05-29T00:00:00Z
workflowType: testarch-atdd
storyId: '2.2'
storyKey: 2-2-cross-intent-execution-isolation
storyFile: D:/Repos/bmad-memtrace/_bmad-output/implementation-artifacts/2-2-cross-intent-execution-isolation.md
atddChecklistPath: _bmad-output/test-artifacts/atdd/atdd-checklist-2-2-cross-intent-execution-isolation.md
generatedTestFiles:
  - tests/unit/interface/dispatch-context.test.ts
  - tests/integration/isolation.test.ts
inputDocuments:
  - _bmad-output/implementation-artifacts/2-2-cross-intent-execution-isolation.md
  - src/types.ts
  - src/errors.ts
  - src/constants.ts
  - src/interface/base-adapter.ts
  - tests/helpers/test-utils.ts
  - tests/fixtures/memtrace-mock.ts
---

# ATDD Checklist — Epic 2, Story 2.2: Cross-Intent Execution Isolation

**Date:** 2026-05-29
**Author:** Magal
**Primary Test Level:** Unit + Integration

---

## Story Summary

Formalize per-dispatch context isolation in the Memtrace middleware adapter so that each intent dispatch gets a fresh, disposable execution context with its own `AbortController`, dedup cache, and error state — preventing timeout or failure in one dispatch from contaminating the next.

**As a** developer whose agent dispatches multiple intents
**I want** each intent dispatch to get a fresh, disposable `DispatchContext`
**So that** a timeout or failure in one dispatch never contaminates the next one

---

## Acceptance Criteria

1. **AC 1** — `dispatch()` creates a fresh `DispatchContext`: new `AbortController` instances, per-dispatch dedup cache, clean error state. No shared mutable state between dispatches (FR22).
2. **AC 2** — Sequential isolation: dispatch A times out and dispatch B runs immediately after — B's results are complete and correct, no residual state, partial caches, or error flags from A leak into B.
3. **AC 3** — Concurrent isolation: dispatch A and B run concurrently — neither's execution context interferes with the other (no shared `AbortController`, no shared dedup cache, no shared error state).
4. **AC 4** — Cleanup on dispatch completion: all timers cleared (`clearTimeout`), all `AbortController` references eligible for GC. `DispatchContext` does not persist between dispatches.
5. **AC 5** — Integration test: sequential timeout isolation — dispatch A (timeout) then dispatch B (valid) on same adapter — B returns correct full result with no contamination.
6. **AC 6** — Integration test: concurrent isolation — `Promise.all` with two intents (`find_code` and `get_symbol_context`) — both return independent correct results with no shared cache hits or cross-dispatch error propagation.

---

## Story Integration Metadata

- **Story ID:** `2.2`
- **Story Key:** `2-2-cross-intent-execution-isolation`
- **Story File:** `_bmad-output/implementation-artifacts/2-2-cross-intent-execution-isolation.md`
- **Checklist Path:** `_bmad-output/test-artifacts/atdd/atdd-checklist-2-2-cross-intent-execution-isolation.md`
- **Generated Test Files:** `tests/unit/interface/dispatch-context.test.ts`, `tests/integration/isolation.test.ts`

---

## Red-Phase Test Scaffolds Created

### Unit Tests: DispatchContext (14 tests)

**File:** `tests/unit/interface/dispatch-context.test.ts`

- ✅ **[P0]** `createDispatchContext()` returns all required fields — AC 1
  - **Status:** RED — `DispatchContext` interface not yet implemented
  - **Verifies:** traceId, dispatchStart, activeTimers, activeControllers, errors, hasDegraded, dedupCache all present with correct types

- ✅ **[P0]** `createDispatchContext()` returns unique traceId per call — AC 1
  - **Status:** RED — per-dispatch trace ID generation not yet implemented
  - **Verifies:** Two consecutive calls produce different traceId values

- ✅ **[P0]** `createDispatchContext()` starts with empty timers and controllers — AC 1, 4
  - **Status:** RED — initialization not yet implemented
  - **Verifies:** activeTimers and activeControllers are empty Sets

- ✅ **[P0]** `createDispatchContext()` starts with clean error state — AC 1
  - **Status:** RED — initialization not yet implemented
  - **Verifies:** errors is empty array, hasDegraded is false

- ✅ **[P0]** `cleanupContext()` clears all timers — AC 4
  - **Status:** RED — `cleanupContext()` not yet implemented
  - **Verifies:** After adding a timer and calling cleanup, the timer is cleared and `activeTimers` is empty

- ✅ **[P0]** `cleanupContext()` aborts all controllers — AC 4
  - **Status:** RED — `cleanupContext()` not yet implemented
  - **Verifies:** After adding a controller and calling cleanup, the controller is aborted (controller.signal.aborted === true) and `activeControllers` is empty

- ✅ **[P0]** `cleanupContext()` is idempotent — AC 4
  - **Status:** RED — idempotent cleanup not yet implemented
  - **Verifies:** Calling cleanup twice does not throw and leaves state empty

- ✅ **[P0]** `cleanupContext()` on already-empty context does not throw — AC 4
  - **Status:** RED — edge case not yet handled
  - **Verifies:** Calling cleanup on freshly created context is safe

- ✅ **[P1]** Context timer registration and auto-removal — AC 1
  - **Status:** RED — timer wiring not yet implemented
  - **Verifies:** Register timer via helper, then resolve — timer is removed from activeTimers

- ✅ **[P1]** Context controller registration and auto-removal — AC 1
  - **Status:** RED — controller wiring not yet implemented
  - **Verifies:** Register controller via helper, then resolve — controller is removed from activeControllers

- ✅ **[P2]** `createDispatchContext()` accepts custom traceId — AC 1
  - **Status:** RED — optional parameter not yet implemented
  - **Verifies:** Passing a traceId string uses it instead of generating a new one

- ✅ **[P2]** `dedupCache` is a fresh `Map` per context — AC 1
  - **Status:** RED — dedupCache not yet added to DispatchContext
  - **Verifies:** Two contexts have independent dedupCache Maps

- ✅ **[P2]** Errors array appends correctly — AC 1
  - **Status:** RED — error accumulation not yet wired
  - **Verifies:** Pushing errors to ctx.errors works; context isolation means errors don't leak

- ✅ **[P2]** `hasDegraded` toggles correctly — AC 1
  - **Status:** RED — degradation flag not yet wired
  - **Verifies:** Setting hasDegraded = true on one context does not affect another

### Integration Tests: Isolation (7 tests)

**File:** `tests/integration/isolation.test.ts`

- ✅ **[P0]** Sequential isolation — timeout in A does not contaminate B — AC 2, 5
  - **Status:** RED — isolation not yet implemented in BaseAdapter
  - **Verifies:** Configure mock backend with timeout on first dispatch; B returns valid FusedContext with correct blocks, no `intent_timeout` error, different trace_id from A, normal elapsed_ms

- ✅ **[P0]** Concurrent isolation — independent results, no shared caches — AC 3, 6
  - **Status:** RED — concurrent isolation not yet implemented
  - **Verifies:** `Promise.all([find_code, get_symbol_context])` — both return independent results with different trace_ids, independent content blocks, no cross-contamination

- ✅ **[P1]** Sequential error contamination — A's error state does not poison B — AC 2, 5
  - **Status:** RED — error state isolation not yet implemented
  - **Verifies:** Dispatch A returns `classification_failed` error; dispatch B (valid find_code) returns correct full result; A's error does not appear in B

- ✅ **[P1]** Sequential isolation — B's metadata is clean after A's timeout — AC 2
  - **Status:** RED — metadata isolation not yet implemented
  - **Verifies:** B's response metadata shows no error flags or degraded state from A

- ✅ **[P1]** Concurrent isolation — both dispatches return valid AgentResponse shape — AC 3
  - **Status:** RED — concurrent pipeline not yet isolated
  - **Verifies:** Both concurrent dispatches return well-formed `AgentResponse` (blocks present, trace_id set, provenance array)

- ✅ **[P2]** Sequential isolation — trace_id differs between A and B — AC 2
  - **Status:** RED — trace ID isolation not yet verified
  - **Verifies:** After sequential A (timeout) then B (valid), B's trace_id is different from A's trace_id

- ✅ **[P2]** AbortController leakage test (optional) — AC 4
  - **Status:** RED — GC/memory test not yet implemented
  - **Verifies:** 50 sequential dispatches on same adapter; no dangling controllers or timers; if `--experimental-vm-modules` available, verify via `global.gc()`

---

## Test Level Strategy

| Level | File | Tests | Covers ACs |
|-------|------|-------|-----------|
| Unit (DispatchContext) | `tests/unit/interface/dispatch-context.test.ts` | 14 | AC 1, 4 |
| Integration (isolation) | `tests/integration/isolation.test.ts` | 7 | AC 2, 3, 5, 6 |
| **Total** | | **21** | **6/6 ACs** |

---

## Data Factories Created

None required — test data is constructed inline using existing fixtures (`createMockMemtrace`, `buildIntent`, `mockCapabilities`) from `tests/fixtures/memtrace-mock.ts` and `tests/helpers/test-utils.ts`.

---

## Fixtures Created

None required — existing `tests/fixtures/memtrace-mock.ts` provides `createMockMemtrace({ failureMode, delayMs, slowTools })` which covers the timeout/failure scenarios needed for isolation testing.

---

## Mock Requirements

### Memtrace Mock (existing)

**File:** `tests/fixtures/memtrace-mock.ts`

Provides `createMockMemtrace({ failureMode, delayMs, slowTools })` — used by integration tests to simulate:
- **Timeout scenario** (`failureMode: 'timeout'` or `slowTools: ['listTools']` with short dispatch timeout) — triggers dispatch A timeout
- **Normal scenario** (default) — dispatch B returns valid results
- **Error scenario** (`failureMode: 'error'`) — triggers `classification_failed` error for error contamination test

---

## Implementation Checklist

### Test: DispatchContext unit tests (14 tests)

**File:** `tests/unit/interface/dispatch-context.test.ts`

**Tasks to make these tests pass:**

- [ ] Define `DispatchContext` interface in `src/interface/base-adapter.ts` or a new `src/interface/dispatch-context.ts`
- [ ] Implement `createDispatchContext(traceId?)` — returns fresh context with empty Sets/arrays/Map
- [ ] Implement `cleanupContext(ctx)` — clears timers, aborts controllers, clears Sets
- [ ] Add per-dispatch dedup cache (`Map<string, string>`) to `DispatchContext`
- [ ] Ensure cleanup is idempotent and safe on empty context
- [ ] Run test: `pnpm test -- tests/unit/interface/dispatch-context.test.ts`
- [ ] All 14 tests pass (green phase)

**Estimated Effort:** 1-2 hours

### Test: Integration isolation tests (7 tests)

**File:** `tests/integration/isolation.test.ts`

**Tasks to make these tests pass:**

- [ ] Refactor `runDispatch()` to accept `DispatchContext` parameter
- [ ] Wire `AbortController` registration into `ctx.activeControllers` for each sub-query
- [ ] Wire `setTimeout` timer IDs into `ctx.activeTimers`
- [ ] Replace local `errors[]` with `ctx.errors`
- [ ] Replace local `hasDegraded` with `ctx.hasDegraded`
- [ ] Add cleanup in `dispatch()` `finally` block: `cleanupContext(ctx)`
- [ ] Ensure per-dispatch dedup cache is created fresh per call
- [ ] Verify NO module-level mutable state exists beyond `this.backend`, `this.config`, `this.contextBuilder`
- [ ] Run test: `pnpm test -- tests/integration/isolation.test.ts`
- [ ] All 7 tests pass (green phase)

**Estimated Effort:** 2-3 hours

---

## Red-Green-Refactor Workflow

### RED Phase (Complete)

- ✅ All tests written as red-phase scaffolds (active — expecting failure)
- ✅ Fixtures and factories verified — existing infrastructure sufficient
- ✅ Mock requirements documented
- ✅ Implementation checklist created

**Verification:**
- Run `pnpm test` — dispatch-context/isolation tests will fail until implementation
- All generated tests assert expected behavior

---

### GREEN Phase (DEV Team - Next Steps)

1. Start with DispatchContext unit tests — implement `createDispatchContext()` and `cleanupContext()` in a new or existing source file
2. Add dedupCache to DispatchContext
3. Refactor `runDispatch()` in `BaseAdapter` to use `DispatchContext`
4. Wire timer/controller registration and cleanup
5. Remove local mutable state from `runDispatch()`
6. Verify integration isolation tests pass
7. Run `pnpm typecheck`, `pnpm lint`, `pnpm build`

### REFACTOR Phase

- Verify all 21 tests pass
- Review code quality: ensure `finally` blocks paired with every `try` that creates timers/controllers
- Verify no `console.log` — all logging through `createLogger`
- Confirm no shared mutable state beyond readonly constructor fields

---

## Running Tests

```bash
# Run all tests (including new isolation scaffolds — will fail until implementation)
pnpm test

# Run specific test file
pnpm test -- tests/unit/interface/dispatch-context.test.ts
pnpm test -- tests/integration/isolation.test.ts
```

---

## Acceptance Criteria Coverage Matrix

| AC | Description | Test Level | Test File(s) | Priority |
|----|-------------|-----------|-------------|----------|
| 1 | Fresh DispatchContext per dispatch | Unit | dispatch-context.test.ts (8 tests) | P0 |
| 2 | Sequential isolation — timeout does not contaminate B | Integration | isolation.test.ts (3 tests) | P0 |
| 3 | Concurrent isolation — no shared state | Integration | isolation.test.ts (3 tests) | P0 |
| 4 | Cleanup: timers cleared, controllers aborted, context not persisted | Unit | dispatch-context.test.ts (6 tests) | P0 |
| 5 | Embedded sequential isolation test | Integration | isolation.test.ts (sequential tests) | P0 |
| 6 | Embedded concurrent isolation test | Integration | isolation.test.ts (concurrent tests) | P0 |

---

## Notes

- This is a pure backend TypeScript middleware library — no UI, no E2E tests
- Test patterns follow existing test suite conventions (vitest, `[P0]/[P1]/[P2]` tags, Given-When-Then comments)
- Existing fixtures (`createMockMemtrace`, `buildIntent`, `mockCapabilities`) are reused for integration tests
- The story already specifies exact file paths and test patterns for `isolation.test.ts`
- DispatchContext is currently an implicit pattern (local variables in runDispatch) — formalizing it as an interface is a defensive hardening measure
- Key risk area: timer cleanup. Every `setTimeout` must be paired with `clearTimeout` in a `finally` block
- After all test scaffolds pass, run `pnpm typecheck`, `pnpm lint`, `pnpm build` for full compliance

---

**Generated by BMad TEA Agent** — 2026-05-29
