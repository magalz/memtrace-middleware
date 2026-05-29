# Test Automation — Story 2.2: Cross-Intent Execution Isolation

**Date:** 2026-05-29
**Gap Source:** ATDD checklist plan vs implemented tests

## Gap Analysis

| Test | Planned | Implemented | Delta | Priority |
|------|---------|-------------|-------|----------|
| `tests/unit/interface/dispatch-context.test.ts` | 14 tests | 0 tests | -14 | P1 |
| `tests/integration/isolation.test.ts` | 7 tests | 6 tests | -1 | P2 |

## Recommended New Tests

### File: `tests/unit/interface/dispatch-context.test.ts` (14 tests)

**Test 1 [P0]**: `createDispatchContext()` returns all required fields
- Given: a traceId string
- When: `createDispatchContext('test-123')` is called
- Then: returns object with traceId, dispatchStart (number), activeTimers (Set), activeControllers (Set), errors ([]), hasDegraded (false), dedupCache (Map)

**Test 2 [P0]**: `createDispatchContext()` returns unique traceId per call
- Given: two separate calls to createDispatchContext
- Then: each returns a different traceId value

**Test 3 [P0]**: `createDispatchContext()` starts with empty timers and controllers
- When: a new context is created
- Then: activeTimers.size === 0 and activeControllers.size === 0

**Test 4 [P0]**: `createDispatchContext()` starts with clean error state
- When: a new context is created
- Then: errors.length === 0 and hasDegraded === false

**Test 5 [P0]**: `cleanupContext()` clears all timers
- Given: a context with one active timer
- When: cleanupContext(ctx) is called
- Then: clearTimeout was called for the timer and activeTimers.size === 0

**Test 6 [P0]**: `cleanupContext()` aborts all controllers
- Given: a context with one active controller
- When: cleanupContext(ctx) is called
- Then: controller.signal.aborted === true and activeControllers.size === 0

**Test 7 [P0]**: `cleanupContext()` is idempotent
- Given: a context with one timer and one controller
- When: cleanupContext is called twice
- Then: second call does not throw and state remains empty

**Test 8 [P0]**: `cleanupContext()` on empty context is safe
- Given: a freshly created context (no timers, no controllers)
- When: cleanupContext is called
- Then: no error is thrown

**Test 9 [P1]**: Context timer registration and auto-removal
- Given: a context and a setTimeout timer
- When: timer is added to activeTimers, then removed after resolution
- Then: activeTimers.size reflects the correct count at each stage

**Test 10 [P1]**: Context controller registration and auto-removal
- Given: a context and an AbortController
- When: controller is added to activeControllers, then removed after resolution
- Then: activeControllers.size reflects the correct count at each stage

**Test 11 [P2]**: dedupCache is a fresh Map per context
- Given: two separate contexts
- When: a key is set in ctxA.dedupCache
- Then: ctxB.dedupCache does not contain that key

**Test 12 [P2]**: Errors array appends correctly
- Given: a context
- When: errors are pushed to ctx.errors
- Then: ctx.errors contains the pushed errors and another context's errors is empty

**Test 13 [P2]**: hasDegraded toggles independently per context
- Given: two separate contexts
- When: ctxA.hasDegraded is set to true
- Then: ctxB.hasDegraded remains false

**Test 14 [P2]**: createDispatchContext accepts custom traceId
- Given: a custom traceId string
- When: createDispatchContext('custom-id') is called
- Then: returned context has traceId === 'custom-id'

### Additional Integration Test (isolation.test.ts)

**Test 7 [P2]**: Dedup cache isolation across concurrent dispatches
- Given: a mock backend that returns the same symbol for two different intents
- When: two concurrent dispatches run via Promise.all
- Then: each dispatch's dedupCache contains only its own entries (no cross-contamination)

## Effort Estimate

| File | Tests | Estimated Hours |
|------|-------|-----------------|
| `tests/unit/interface/dispatch-context.test.ts` | 14 | 1-2 |
| `tests/integration/isolation.test.ts` | 1 | 0.5 |
| **Total** | **15** | **1.5-2.5** |
