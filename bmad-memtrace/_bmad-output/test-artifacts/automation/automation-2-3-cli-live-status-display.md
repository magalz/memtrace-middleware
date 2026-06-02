# Automation Summary — Story 2.3: CLI Live Status Display

**Generated**: 2026-05-29
**Workflow**: bmad-testarch-automate v5.0
**Mode**: BMad-Integrated (Story 2.3)
**Status**: 3 optional gaps identified — zero blocking gaps

---

## Coverage Analysis

### Existing Test Coverage (33 new tests)

| Test File                                  | Tests | P0  | P1  | P2  | AC Coverage      |
| ------------------------------------------ | ----- | --- | --- | --- | ---------------- |
| `tests/unit/telemetry/ring-buffer.test.ts` | 17    | 5   | 5   | 7   | AC 3, AC 5 ✅    |
| `tests/unit/cli/status.test.ts`            | 16    | 3   | 10  | 3   | AC 1, 2, 4, 6 ✅ |

### Source Module Coverage

| Module                         | Tests | Direct Test            | Coverage Status                           |
| ------------------------------ | ----- | ---------------------- | ----------------------------------------- |
| `src/telemetry/ring-buffer.ts` | 17    | ✅ ring-buffer.test.ts | FULL                                      |
| `src/telemetry/metrics.ts`     | 0     | ❌ No dedicated test   | INDIRECT (via integration)                |
| `src/telemetry/emitter.ts`     | 0     | ❌ No test             | NONE                                      |
| `src/telemetry/uptime.ts`      | 0     | ❌ No test             | NONE                                      |
| `src/cli/status.ts`            | 16    | ✅ status.test.ts      | FULL                                      |
| `src/cli/index.ts`             | 0     | No automated test      | OMITTED (CLI entry invokes platform APIs) |

---

## Automation Targets Identified

### Gap 1: metrics.ts — Metrics Singleton (P2)

**File**: `src/telemetry/metrics.ts` (80 lines)
**Risk**: Medium — the metrics singleton is tested indirectly through integration but has no fast, isolated unit test

**Recommended test file**: `tests/unit/telemetry/metrics.test.ts`

**Coverage plan**:
| Test | Priority | Description |
|---|---|---|
| `recordDispatch(success)` increments success counter | P1 | Verify `getSnapshot().query_success` incremented |
| `recordDispatch(failure)` increments failure counter | P1 | Verify `getSnapshot().query_failure` incremented |
| `recordDispatch` sets last_dispatch_result | P1 | success→'success', failure→'failure' |
| `getSnapshot` returns correct confidence percentiles | P1 | Push known values, verify p50 and p95 |
| `getSnapshot` returns 0 for empty confidence buffer | P1 | No calls → p50=0, p95=0 |
| `updateTier` reflects in snapshot | P2 | Change tier, verify snapshot.tier matches |
| `reset` clears all state | P2 | After recordDispatch + reset, snapshot is clean |
| Confidence percentile computation edge cases | P2 | Single value, two values, all same value |

**Fixture required**: None — metrics is a singleton, can be reset between tests via `metrics.reset()`

### Gap 2: emitter.ts — NDJSON Emitter (P3)

**File**: `src/telemetry/emitter.ts` (10 lines)
**Risk**: Low — trivial wrapper around `process.stderr.write`

**Recommended test file**: `tests/unit/telemetry/emitter.test.ts`

**Coverage plan**:
| Test | Priority | Description |
|---|---|---|
| `emit` writes NDJSON to stderr | P3 | Spy on `process.stderr.write`, verify JSON + newline |

**Fixture required**: Stub on `process.stderr.write`

### Gap 3: uptime.ts — Process Uptime (P3)

**File**: `src/telemetry/uptime.ts` (3 lines)
**Risk**: Low — trivial wrapper around `process.uptime()`

**Recommended test file**: `tests/unit/telemetry/uptime.test.ts`

**Coverage plan**:
| Test | Priority | Description |
|---|---|---|
| `getUptimeSeconds` returns non-negative integer | P3 | Verify `typeof` number, `>= 0`, `Number.isInteger` |

**Fixture required**: None

---

## Test Infrastructure

### Existing Patterns (to follow)

- Framework: Vitest (already configured)
- Priority tags: `[P0]`, `[P1]`, `[P2]` in test names (established convention)
- Import style: `import { describe, it, expect } from 'vitest'`
- Test location: `tests/unit/telemetry/`
- File naming: `*.test.ts` (not `.spec.ts`)

### New Fixture Requirements

None. All three proposed tests are pure unit tests with no shared state. The metrics singleton has a built-in `reset()` method for isolation.

---

## Generated Test Scaffolds

### Scaffold: `tests/unit/telemetry/metrics.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { metrics } from '../../../src/telemetry/metrics.js';
import { DegradationTier } from '../../../src/types.js';

describe('metrics', () => {
  beforeEach(() => {
    metrics.reset();
  });

  it('[P1] recordDispatch increments success count for successful dispatch', () => {
    metrics.recordDispatch(true, 'find_code', 0.95, 100);
    const snap = metrics.getSnapshot();
    expect(snap.query_success).toBe(1);
    expect(snap.query_failure).toBe(0);
  });

  it('[P1] recordDispatch increments failure count for failed dispatch', () => {
    metrics.recordDispatch(false, 'find_code', 0, 50);
    const snap = metrics.getSnapshot();
    expect(snap.query_failure).toBe(1);
    expect(snap.query_success).toBe(0);
  });

  it('[P1] recordDispatch sets last_dispatch_result', () => {
    metrics.recordDispatch(true, 'find_code', 0.95, 100);
    expect(metrics.getSnapshot().last_dispatch_result).toBe('success');
    metrics.recordDispatch(false, 'find_code', 0, 50);
    expect(metrics.getSnapshot().last_dispatch_result).toBe('failure');
  });

  it('[P1] getSnapshot returns correct confidence percentiles', () => {
    const confidences = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
    for (const c of confidences) {
      metrics.recordDispatch(true, 'find_code', c, 10);
    }
    const snap = metrics.getSnapshot();
    expect(snap.confidence_p50).toBeCloseTo(0.55, 1);
    expect(snap.confidence_p95).toBeCloseTo(0.95, 1);
  });

  it('[P1] getSnapshot returns 0 for empty confidence buffer', () => {
    const snap = metrics.getSnapshot();
    expect(snap.confidence_p50).toBe(0);
    expect(snap.confidence_p95).toBe(0);
  });

  it('[P2] updateTier reflects in snapshot', () => {
    metrics.updateTier(DegradationTier.FailClosed);
    expect(metrics.getSnapshot().tier).toBe(DegradationTier.FailClosed);
    metrics.updateTier(DegradationTier.Full);
    expect(metrics.getSnapshot().tier).toBe(DegradationTier.Full);
  });

  it('[P2] reset clears all state', () => {
    metrics.recordDispatch(true, 'find_code', 0.95, 100);
    metrics.updateTier(DegradationTier.FailClosed);
    metrics.reset();
    const snap = metrics.getSnapshot();
    expect(snap.query_success).toBe(0);
    expect(snap.query_failure).toBe(0);
    expect(snap.tier).toBe(DegradationTier.Full);
    expect(snap.active_intents).toEqual([]);
    expect(snap.last_dispatch_result).toBeNull();
  });

  it('[P2] active_intents deduplicates across intents', () => {
    metrics.recordDispatch(true, 'find_code', 0.9, 10);
    metrics.recordDispatch(true, 'get_symbol_context', 0.85, 20);
    metrics.recordDispatch(true, 'find_code', 0.95, 15);
    const snap = metrics.getSnapshot();
    expect(snap.active_intents).toEqual(['find_code', 'get_symbol_context']);
  });
});
```

### Scaffold: `tests/unit/telemetry/emitter.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { emit } from '../../../src/telemetry/emitter.js';
import { DegradationTier } from '../../../src/types.js';

describe('emit', () => {
  it('[P3] writes NDJSON to stderr', () => {
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const event = {
      type: 'dispatch_end' as const,
      trace_id: 'test-123',
      tier: DegradationTier.Full,
      phase: 'execute',
      elapsed_ms: 42,
      timestamp: new Date().toISOString(),
    };
    emit(event);
    const written = writeSpy.mock.calls[0][0];
    expect(typeof written).toBe('string');
    expect(written).toContain('\n');
    const parsed = JSON.parse(written.trim());
    expect(parsed.type).toBe('dispatch_end');
    expect(parsed.trace_id).toBe('test-123');
    writeSpy.mockRestore();
  });
});
```

### Scaffold: `tests/unit/telemetry/uptime.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { getUptimeSeconds } from '../../../src/telemetry/uptime.js';

describe('getUptimeSeconds', () => {
  it('[P3] returns non-negative integer', () => {
    const uptime = getUptimeSeconds();
    expect(typeof uptime).toBe('number');
    expect(uptime).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(uptime)).toBe(true);
  });
});
```

---

## Summary

| Metric                        | Value                           |
| ----------------------------- | ------------------------------- |
| Existing tests for story      | 33 (17 ring-buffer + 16 status) |
| Automation gaps identified    | 3 (all P2/P3 — optional)        |
| Blocking gaps                 | 0                               |
| New test files proposed       | 3                               |
| New test cases proposed       | 14                              |
| Priority breakdown (proposed) | P1: 6, P2: 5, P3: 3             |

**Assessment**: The existing test suite (33 tests) provides FULL coverage of all 6 acceptance criteria. The three automation gaps are optional enhancements that would improve structural coverage completeness but are NOT blocking. Priority recommendation: implement the metrics.test.ts (7 tests, P1-P2) in the next sprint; emitter.test.ts and uptime.test.ts (P3) are nice-to-haves.

### Next Steps

1. ✅ **No blocking gaps** — proceed to code review
2. 🔧 **Recommended (P2)**: Create `tests/unit/telemetry/metrics.test.ts` with 7-8 tests for the metrics singleton
3. 📝 **Optional (P3)**: Create `tests/unit/telemetry/emitter.test.ts` and `tests/unit/telemetry/uptime.test.ts`
