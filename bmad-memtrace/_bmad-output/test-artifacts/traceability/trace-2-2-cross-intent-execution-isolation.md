# Traceability Matrix — Story 2.2: Cross-Intent Execution Isolation

**Date:** 2026-05-29
**Source:** Story ACs → Tests
**Coverage Oracle:** Formal ACs from story file (6 ACs)

## Acceptance Criteria to Test Mapping

| AC | Description | Test(s) | Coverage |
|----|-------------|---------|----------|
| 1 | `dispatch()` creates fresh `DispatchContext` — new `AbortController`, dedup cache, clean error state | All isolation tests implicitly via `adapter.dispatch()` | **FULL** (integration-level — unit tests missing) |
| 2 | Sequential isolation — timeout in A does not contaminate B | `[P0] sequential dispatch isolation` (line 24), `[P1] dispatch B returns valid FusedContext with clean metadata after A timeout` (line 184) | **FULL** |
| 3 | Concurrent isolation — no shared `AbortController`, dedup cache, error state | `[P0] concurrent dispatch isolation` (line 82), `[P1] concurrent dispatch testing agent response shape validity` (line 245) | **FULL** |
| 4 | Cleanup: timers cleared, controllers GC-eligible, context not persisted | `[P2] AbortController leakage — 50 sequential dispatches on same adapter` (line 225) | **PARTIAL** (no unit-level cleanupContext verification; leakage test doesn't measure GC) |
| 5 | Embedded: sequential timeout then valid dispatch (isolation.test.ts) | `[P0] sequential dispatch isolation` (line 24) | **FULL** |
| 6 | Embedded: concurrent dispatches via `Promise.all` (isolation.test.ts) | `[P0] concurrent dispatch isolation` (line 82) | **FULL** |

## Coverage Summary

| Metric | Value |
|--------|-------|
| Total ACs | 6 |
| FULL | 4 (67%) |
| PARTIAL | 1 (17%) — AC 4 |
| FULL (integration-only, missing unit) | 1 (17%) — AC 1 |
| NONE | 0 |

## Gaps Identified

1. **AC 1 (PARTIAL)**: DispatchContext interface, `createDispatchContext()`, `cleanupContext()` have no unit-level tests. Only covered implicitly through integration tests.
2. **AC 4 (PARTIAL)**: No unit test verifying `cleanupContext()` clears timers and aborts controllers in isolation. Leakage test runs 50 dispatches but doesn't measure memory/GC.
3. **Planned but missing**: 14 unit tests from ATDD checklist (`tests/unit/interface/dispatch-context.test.ts`) were not created.
