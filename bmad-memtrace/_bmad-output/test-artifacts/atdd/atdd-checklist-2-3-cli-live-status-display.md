---
stepsCompleted:
  - step-01-preflight-and-context
  - step-02-generate-scaffolds
lastStep: step-02-generate-scaffolds
lastSaved: '2026-05-29T09:16:00Z'
workflowType: 'testarch-atdd'
storyId: 'story-2-3'
storyKey: '2-3-cli-live-status-display'
storyFile: '_bmad-output/implementation-artifacts/2-3-cli-live-status-display.md'
atddChecklistPath: '_bmad-output/test-artifacts/atdd/atdd-checklist-2-3-cli-live-status-display.md'
generatedTestFiles:
  - 'memtrace-middleware/tests/unit/telemetry/ring-buffer.test.ts'
  - 'memtrace-middleware/tests/unit/cli/status.test.ts'
inputDocuments: []
---

# ATDD Checklist - Epic 2, Story 3: CLI Live Status Display

**Date:** 2026-05-29
**Author:** Murat (Master Test Architect)
**Primary Test Level:** Unit

---

## Story Summary

As a developer running the middleware, I want a live terminal display showing what the middleware is doing — active intents, degradation tier, query success/failure — so that I trust the pipeline is working and can diagnose issues at a glance the moment smart results arrive.

**As a** developer running the middleware
**I want** a live-updating CLI status display (500ms refresh, \r overwrite) with health dot, degradation tier, active intents, query success/failure counts, confidence percentiles, and transient flash indicators
**So that** I can see the middleware is alive and diagnose issues without polling Memtrace directly

---

## Acceptance Criteria

1. **AC1 (TTY live display):** Given the user runs `memtrace --status`, When `src/cli/status.ts` renders the display, Then it shows a live-updating single-line display (500ms refresh, `\r` overwrite) with: color-coded health dot, current degradation tier name, active intent types, recent query success/failure count (last N dispatches), classification confidence distribution.

2. **AC2 (Flash indicator):** Given an intent execution completes, When the status display refreshes, Then a brief transient signal flashes indicating the most recent intent result (success/failure) before fading.

3. **AC3 (Ring buffer data source):** Given the telemetry ring buffer in `src/telemetry/ring-buffer.ts` holds recent events, When `src/cli/status.ts` reads from it, Then the display shows live data sourced from the ring buffer — not polling Memtrace directly.

4. **AC4 (TTY vs piped output):** Given the middleware is running, When stdout is connected to a terminal, Then `--status` output uses terminal escape codes (`\r`, ANSI colors). When piped (`!isTTY`), it outputs plain text NDJSON with keys: `status`, `tier`, `uptime_seconds`, `version`, `active_intents`, `query_success`, `query_failure`, `confidence_p50`, `confidence_p95`.

5. **AC5 (Ring buffer behavior):** Given the ring buffer holds recent telemetry events, When `tests/unit/telemetry/ring-buffer.test.ts` verifies capacity and behavior, Then the buffer stores the most recent N events, drops oldest on overflow, supports concurrent read/write, and returns correct count (property-based: overflow, wrap-around, concurrent reads).

6. **AC6 (CLI output format):** Given CLI `--status` output is captured, When `tests/unit/cli/status.test.ts` verifies the output format, Then all required fields are present with correct types and values under each degradation tier.

---

## Story Integration Metadata

- **Story ID:** `story-2-3`
- **Story Key:** `2-3-cli-live-status-display`
- **Story File:** `_bmad-output/implementation-artifacts/2-3-cli-live-status-display.md`
- **Checklist Path:** `_bmad-output/test-artifacts/atdd/atdd-checklist-2-3-cli-live-status-display.md`
- **Generated Test Files:** `memtrace-middleware/tests/unit/telemetry/ring-buffer.test.ts`, `memtrace-middleware/tests/unit/cli/status.test.ts`

---

## Red-Phase Test Scaffolds Created

### Ring Buffer Unit Tests (17 tests)

**File:** `memtrace-middleware/tests/unit/telemetry/ring-buffer.test.ts` (estimated ~180 lines)

- ✅ **Test:** `[P0] pushes items up to capacity without overflow`
  - **Status:** RED - RingBuffer class not yet implemented
  - **Verifies:** Push exactly N items into capacity N → count = N, no overflow, all items present

- ✅ **Test:** `[P0] drops oldest item on overflow beyond capacity`
  - **Status:** RED - RingBuffer class not yet implemented
  - **Verifies:** Push N+1 items into capacity N → count stays N, oldest item dropped

- ✅ **Test:** `[P0] wraps around correctly (head < tail scenario)`
  - **Status:** RED - RingBuffer class not yet implemented
  - **Verifies:** Fill buffer, push more items → head wraps past tail, most recent N items returned

- ✅ **Test:** `[P0] toArray returns a snapshot copy not internal reference`
  - **Status:** RED - RingBuffer class not yet implemented
  - **Verifies:** Mutating returned array does not affect internal buffer state

- ✅ **Test:** `[P1] handles concurrent read during write (sequential simulation)`
  - **Status:** RED - RingBuffer class not yet implemented
  - **Verifies:** toArray() called mid-push returns consistent snapshot

- ✅ **Test:** `[P1] empty buffer returns empty array`
  - **Status:** RED - RingBuffer class not yet implemented
  - **Verifies:** New or cleared buffer returns `[]`

- ✅ **Test:** `[P1] single element buffer works correctly`
  - **Status:** RED - RingBuffer class not yet implemented
  - **Verifies:** Push one item, toArray returns `[item]`, count is 1

- ✅ **Test:** `[P1] clear resets count to zero and toArray returns empty`
  - **Status:** RED - RingBuffer class not yet implemented
  - **Verifies:** After clear(), count=0 and toArray() returns `[]`

- ✅ **Test:** `[P1] getCount returns accurate count after mixed operations`
  - **Status:** RED - RingBuffer class not yet implemented
  - **Verifies:** Count accuracy across push, overflow, clear cycles

- ✅ **Test:** `[P1] getCapacity returns constructor capacity`
  - **Status:** RED - RingBuffer class not yet implemented
  - **Verifies:** getCapacity() matches the capacity passed to constructor

- ✅ **Test:** `[P2] capacity 1 edge case works correctly`
  - **Status:** RED - RingBuffer class not yet implemented
  - **Verifies:** Min capacity ring buffer pushes/overflows correctly

- ✅ **Test:** `[P2] capacity 0 throws or clamps at construction`
  - **Status:** RED - RingBuffer class not yet implemented
  - **Verifies:** Invalid capacity handled (throw or clamp to 1)

- ✅ **Test:** `[P2] toArray returns items in insertion order`
  - **Status:** RED - RingBuffer class not yet implemented
  - **Verifies:** After wrap-around, order is oldest→newest

- ✅ **Test:** `[P2] multiple wrap-arounds maintain correct data`
  - **Status:** RED - RingBuffer class not yet implemented
  - **Verifies:** 3+ full wrap cycles produce correct content

- ✅ **Test:** `[P2] 100k ops without memory growth or throw`
  - **Status:** RED - RingBuffer class not yet implemented
  - **Verifies:** Stress test — 100k push operations complete without error

- ✅ **Test:** `[P2] toArray called multiple times returns consistent results`
  - **Status:** RED - RingBuffer class not yet implemented
  - **Verifies:** Repeated toArray() calls without intervening pushes return identical arrays

- ✅ **Test:** `[P2] confidence buffer secondary ring buffer pattern`
  - **Status:** RED - RingBuffer class not yet implemented
  - **Verifies:** RingBuffer<number> used for confidence tracking works identically

### CLI Status Unit Tests (11 tests)

**File:** `memtrace-middleware/tests/unit/cli/status.test.ts` (estimated ~220 lines)

- ✅ **Test:** `[P0] renders Full tier snapshot with correct JSON keys in piped mode`
  - **Status:** RED - status.ts not yet implemented
  - **Verifies:** Full tier → JSON output, all required keys present: status, tier, uptime_seconds, version, active_intents, query_success, query_failure, confidence_p50, confidence_p95

- ✅ **Test:** `[P0] TTY mode produces ANSI color codes and carriage return`
  - **Status:** RED - status.ts not yet implemented
  - **Verifies:** isTTY=true output contains `\r`, `\x1b[32m` (green), `●` health dot

- ✅ **Test:** `[P0] degraded tiers produce correct tier name and color in output`
  - **Status:** RED - status.ts not yet implemented
  - **Verifies:** Each DegradationTier produces correct name + colored health dot (Full→green●, IntentReduced/Passthrough→yellow◐, FailClosed→red✕)

- ✅ **Test:** `[P0] all required JSON fields present with correct types`
  - **Status:** RED - status.ts not yet implemented
  - **Verifies:** `typeof` checks: status=string, tier=string, uptime_seconds=number, version=string, active_intents=Array, query_success=number, query_failure=number, confidence_p50=number, confidence_p95=number

- ✅ **Test:** `[P1] confidence p50 and p95 are valid numbers (not NaN, not Infinity)`
  - **Status:** RED - status.ts not yet implemented
  - **Verifies:** confidence values are finite numbers with isFinite() check

- ✅ **Test:** `[P1] active_intents is array of strings`
  - **Status:** RED - status.ts not yet implemented
  - **Verifies:** Array.isArray and every element is typeof string

- ✅ **Test:** `[P1] query_success and query_failure are non-negative integers`
  - **Status:** RED - status.ts not yet implemented
  - **Verifies:** Number.isInteger and >= 0

- ✅ **Test:** `[P1] flash indicator appears for 3 refresh cycles then clears`
  - **Status:** RED - status.ts not yet implemented
  - **Verifies:** Flash state management: flashCounter set to 3 on dispatch, decrements each render, flash string appended when active, cleared when counter reaches 0

- ✅ **Test:** `[P1] null snapshot handled gracefully (no crash)`
  - **Status:** RED - status.ts not yet implemented
  - **Verifies:** renderStatus(null/undefined) returns empty string or "no data" — never throws

- ✅ **Test:** `[P2] piped NDJSON has one JSON object per line with trailing newline`
  - **Status:** RED - status.ts not yet implemented
  - **Verifies:** Each refresh emits exactly one JSON line ending with `\n`

- ✅ **Test:** `[P2] piped output has no ANSI escape codes`
  - **Status:** RED - status.ts not yet implemented
  - **Verifies:** isTTY=false output regex does NOT match `\x1b\[` patterns

---

## Data Factories Created

None required for this story. StatusSnapshot objects are created inline with mock data. Existing `tests/fixtures/memtrace-mock.ts` and `tests/helpers/test-utils.ts` may be consumed but no new factories are needed.

---

## Fixtures Created

None required for this story. Tests run synchronously with mock snapshots and do not need setup/teardown fixtures.

---

## Mock Requirements

### StatusSnapshot Mock

**Used by:** `tests/unit/cli/status.test.ts`

**Success Snapshot:**

```json
{
  "tier": "full",
  "uptime_seconds": 120,
  "active_intents": ["find_code", "get_symbol_context"],
  "query_success": 42,
  "query_failure": 3,
  "confidence_p50": 0.92,
  "confidence_p95": 0.97,
  "last_dispatch_result": "success"
}
```

**Failure Snapshot:**

```json
{
  "tier": "fail_closed",
  "uptime_seconds": 300,
  "active_intents": [],
  "query_success": 5,
  "query_failure": 18,
  "confidence_p50": 0.0,
  "confidence_p95": 0.0,
  "last_dispatch_result": "failure"
}
```

**Notes:** Snapshots are created inline in each test — no external mock server needed. All status tests are unit-level with synchronous calls.

---

## Required data-testid Attributes

Not applicable — this is a CLI application, not a web UI. No data-testid attributes needed.

---

## Implementation Checklist

### Test: RingBuffer unit tests

**File:** `tests/unit/telemetry/ring-buffer.test.ts`

**Tasks to make this test pass:**

- [ ] Create `src/telemetry/ring-buffer.ts` — generic `RingBuffer<T>` class with fixed capacity, head/tail pointers, O(1) push
- [ ] Implement `push(item)`, `toArray()`, `clear()`, `getCount()`, `getCapacity()`
- [ ] Ensure `toArray()` returns a shallow copy (not internal reference)
- [ ] Handle capacity=0 edge case (throw or clamp)
- [ ] Write all 17 test cases in `tests/unit/telemetry/ring-buffer.test.ts`
- [ ] Run test: `pnpm test -- tests/unit/telemetry/ring-buffer.test.ts`
- [ ] ✅ All ring buffer tests pass (green phase)

**Estimated Effort:** 2.0 hours

---

### Test: CLI status unit tests

**File:** `tests/unit/cli/status.test.ts`

**Tasks to make this test pass:**

- [ ] Add `MIDDLEWARE_VERSION` constant to `src/constants.ts`
- [ ] Add `StatusSnapshot` and `EventType` types to `src/types.ts`
- [ ] Create `src/telemetry/ring-buffer.ts`
- [ ] Create `src/telemetry/metrics.ts` — singleton with `recordDispatch()` and `getSnapshot()`
- [ ] Create `src/telemetry/uptime.ts` — `getUptimeSeconds()`
- [ ] Create `src/telemetry/emitter.ts` — `emit(event: TelemetryEvent)`
- [ ] Create `src/telemetry/index.ts` barrel exports
- [ ] Create `src/cli/status.ts` — `startStatusDisplay()` and `renderStatus()`
- [ ] Implement `renderStatus(snapshot, isTTY)` — both TTY and piped output paths
- [ ] Implement flash indicator state management (flashCounter, 3-cycle decay)
- [ ] Write all 11 test cases in `tests/unit/cli/status.test.ts`
- [ ] Run test: `pnpm test -- tests/unit/cli/status.test.ts`
- [ ] ✅ All CLI status tests pass (green phase)

**Estimated Effort:** 3.0 hours

---

## Running Tests

```bash
# Run all tests for this story
pnpm test

# Run ring buffer tests specifically
pnpm test -- tests/unit/telemetry/ring-buffer.test.ts

# Run CLI status tests specifically
pnpm test -- tests/unit/cli/status.test.ts

# Run tests with coverage
pnpm test -- --coverage
```

---

## Red-Green-Refactor Workflow

### RED Phase (Complete) ✅

**TEA Agent Responsibilities:**

- ✅ All tests documented as red-phase scaffolds
- ✅ Mock requirements documented (StatusSnapshot inline mocks)
- ✅ Implementation checklist created for both test files
- ✅ Ring buffer property-based behavior documented (overflow, wrap-around, concurrent reads)

**Verification:**

- All scaffolded tests listed with expected failure reasons
- Both test files must be created with `describe`/`it`/`expect` from vitest using `[P0]`/`[P1]`/`[P2]` priority naming
- Any activated test fails due to missing implementation, not test bugs

---

### GREEN Phase (DEV Team - Next Steps)

**DEV Agent Responsibilities:**

1. **Start with ring buffer tests** (lowest dependency, foundational for everything else)
2. **Remove `test.skip()`** (or write the tests if not yet present) and confirm they fail first
3. **Implement `RingBuffer<T>`** in `src/telemetry/ring-buffer.ts`
4. **Run ring buffer tests** to verify they pass
5. **Move to metrics singleton + uptime + emitter** in `src/telemetry/`
6. **Implement `renderStatus()` and `startStatusDisplay()`** in `src/cli/status.ts`
7. **Write CLI status tests** and run them all
8. **Work one activated test at a time** (red → green for each)

**Key Principles:**

- RingBuffer first: no other module depends on it
- renderStatus() is a pure function — testable without mocks
- Flash indicator is a closure in status.ts, not in metrics
- `console.log` is forbidden — use `createLogger()` or `process.stdout.write`

---

### REFACTOR Phase (DEV Team - After All Tests Pass)

**DEV Agent Responsibilities:**

1. Verify all 28 tests pass
2. Review for code quality: no `any`, no `console.log`, proper cleanup
3. Ensure `setInterval` has matching `clearInterval` via `stop()` method
4. Run full test suite to confirm no regressions in existing 168 tests
5. Run `pnpm typecheck` — zero errors
6. Run `pnpm lint` — ESLint zero errors
7. Run `pnpm build` — ESM+CJS+DTS compiled without errors

---

## Next Steps

1. **Link this checklist** into the story file `Dev Notes` / `ATDD Artifacts` section
2. **Begin implementation** with ring buffer (Task 1) — it is the backbone for everything
3. **Then metrics singleton + uptime** (Task 2, 3) — the data provider
4. **Then CLI status display** (Task 4, 6) — the consumer
5. **Then CLI entry point** (Task 5) — the wiring
6. **Finally barrel exports** (Task 7) + verify (Task 8)
7. **Activate one scaffold at a time** by writing the test, confirming it fails first (red), then implementing (green)

---

## Knowledge Base References Applied

This ATDD workflow consulted:

- **Ring Buffer Pattern** — fixed-capacity circular buffer, O(1) push, head/tail pointers
- **Property-Based Test Design** — overflow, wrap-around, edge cases (capacity 0, 1), concurrent read safety
- **Given-When-Then** — one assertion per test, deterministic, isolated
- **P0/P1/P2 Prioritization** — critical path vs edge case vs nice-to-have

---

## Test Execution Evidence

### Initial Scaffold Review / RED Verification

**Command:** `pnpm test -- tests/unit/telemetry/ring-buffer.test.ts tests/unit/cli/status.test.ts`

**Expected Results:**

Tests do not yet exist — files to be created by DEV during implementation phase. Once created with `test.skip()`, running them will show all tests skipped. Removing `.skip` will produce RED failures until implementation is complete.

**Summary:**

- Total scaffolds: 28 (17 ring buffer + 11 CLI status)
- Skipped: 28 (expected before activation)
- Activated RED tests: 0 (expected before activation)
- The ring buffer tests (P0-P2) should be activated first and implemented before CLI status tests

---

## Notes

- **Ring buffer is the backbone.** Get it right first — all status display data flows through it.
- **metrics.getSnapshot() is synchronous** — no async/await needed for reading status.
- **Flash indicator is purely visual** — tracked in status.ts closure, not in metrics singleton.
- **TTY detection** uses `process.stdout.isTTY` — undefined defaults to piped mode (NDJSON).
- **No Memtrace polling.** The status display reads from in-memory ring buffer — never calls Memtrace MCP tools.
- **Existing test count:** 168 tests across 18 files. This story adds ~28 tests, total ~196.
- **`console.log` is forbidden** — all output via `createLogger('telemetry')` or `process.stdout.write`.

---

## Contact

**Questions or Issues?**

- Ask in team standup
- Refer to story file: `_bmad-output/implementation-artifacts/2-3-cli-live-status-display.md`

---

**Generated by BMad TEA Agent** - 2026-05-29
