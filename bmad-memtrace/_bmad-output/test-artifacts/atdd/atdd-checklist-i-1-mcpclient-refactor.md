---
stepsCompleted:
  ['step-01-preflight-and-context', 'step-02-generation-mode', 'step-03-test-strategy']
lastStep: 'step-03-test-strategy'
lastSaved: '2026-05-29T11:07:00.000Z'
workflowType: 'testarch-atdd'
storyId: 'i-1'
storyKey: 'i-1-mcpclient-refactor'
storyFile: '_bmad-output/implementation-artifacts/i-1-mcpclient-refactor.md'
atddChecklistPath: '_bmad-output/test-artifacts/atdd/atdd-checklist-i-1-mcpclient-refactor.md'
generatedTestFiles:
  - '_bmad/scripts/memtrace/memtrace-adapter.test.mjs'
inputDocuments:
  - '_bmad-output/implementation-artifacts/i-1-mcpclient-refactor.md'
  - '_bmad/scripts/memtrace/memtrace-adapter.test.mjs'
  - '_bmad/scripts/memtrace/memtrace-adapter.mjs'
---

# ATDD Checklist - Story I.1: McpClient Refactor — Robustness Hardening

**Date:** 2026-05-29
**Author:** Magal (via Murat, Master Test Architect)
**Primary Test Level:** Unit (node:test)

---

## Story Summary

Refactor the McpClient class in memtrace-adapter.mjs to handle out-of-order MCP responses, cancel in-flight operations cleanly, shut down without resource leaks, harden JSON parsing, capture stderr, and add debug instrumentation — all without breaking the existing 30+ test suite.

**As a** BMad System
**I want** McpClient to be robust against out-of-order responses, timeout leaks, and resource leaks
**So that** the adapter is production-grade for CI/CD in Epic 4 with zero silent resource leaks or response mismatches

---

## Acceptance Criteria

1. **AC#1 — Out-of-order responses:** Non-sequential MCP responses are correctly matched by `id`; no response silently discarded or incorrectly routed.
2. **AC#2 — Timeout cancellation:** `withTimeout()` actively cancels underlying operation, tags errors with phase (`spawn`/`handshake`/`query`), leaves no stale timers.
3. **AC#3 — Shutdown leak fixes:** Ordered shutdown sequence (request → stdin.end → wait exit 2s → SIGTERM); listeners removed; idempotent for already-dead child.
4. **AC#4 — kill() resource cleanup:** Clears all timers, rejects pending promises, removes listeners, ends stdin, sends SIGTERM; idempotent.
5. **AC#5 — JSON parse hardening:** Malformed JSON lines logged (truncated 120 chars), skipped; processing continues; notifications consumed silently.
6. **AC#6 — Stderr capture:** stderr output captured and logged with `[MCP stderr]` prefix; callers need no separate stderr handling.
7. **AC#7 — Test regression:** All 30+ existing tests pass with zero regressions.
8. **AC#8 — Debug instrumentation:** Structured `[McpClient] <phase> <event>` debug lines when `MEMTRACE_DEBUG=1` is set.

---

## Story Integration Metadata

- **Story ID:** `i-1`
- **Story Key:** `i-1-mcpclient-refactor`
- **Story File:** `_bmad-output/implementation-artifacts/i-1-mcpclient-refactor.md`
- **Checklist Path:** `_bmad-output/test-artifacts/atdd/atdd-checklist-i-1-mcpclient-refactor.md`
- **Generated Test Files:** `_bmad/scripts/memtrace/memtrace-adapter.test.mjs` (extending existing test suite)

---

## Red-Phase Test Scaffolds IDentified

> **Note:** This story extends an existing test file (`memtrace-adapter.test.mjs`, 445 lines, `node:test`). The red-phase scaffolds are the **new test cases** to be added. All existing tests (30+) must continue passing (AC#7).

### Unit Tests — McpClient Internal Behavior (14 new tests)

**File:** `_bmad/scripts/memtrace/memtrace-adapter.test.mjs` (extends existing suite)

#### AC#1: Out-of-order response handling

| #   | Test                                                                                                                                                                        | Status                                                                                                   | Failure Reason |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------- |
| 1   | **out-of-order responses are correctly dispatched by id** — mock stdin/stdout, send 3 responses as id=2, id=1, id=3                                                         | RED — `Map<id, {resolve,reject}>` registry not yet implemented; per-request listener still single-stream |
| 2   | **notification messages (no id, method: "notifications/...") are silently consumed** — send `{"method":"notifications/updated"}` and verify no promise is resolved/rejected | RED — notification filtering not implemented in stream listener                                          |
| 3   | **response for cancelled/deleted request is silently ignored** — send response for an id not in the active registry                                                         | RED — no guard for unknown id in dispatch                                                                |

#### AC#2: Timeout cancellation

| #   | Test                                                                                                       | Status                                                 | Failure Reason |
| --- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | -------------- |
| 4   | **withTimeout rejects with TimeoutError containing phase field** — call with `phase: "query"`, let it fire | RED — `phase` parameter not added to `withTimeout()`   |
| 5   | **timeout in sendRequest removes request from active registry** — verify map size after timeout            | RED — timeout cleanup not implemented in `sendRequest` |
| 6   | **timeout in spawn cleans up child error/exit listeners** — verify no listener leak after spawn timeout    | RED — spawn timeout cleanup not implemented            |

#### AC#3: Shutdown leak fixes

| #   | Test                                                                                             | Status                                             | Failure Reason |
| --- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------- | -------------- |
| 7   | **shutdown() removes stdout and stderr listeners after completion** — verify listener count      | RED — listener removal in shutdown not implemented |
| 8   | **shutdown() on already-dead child resolves immediately** — call shutdown after child exit event | RED — idempotent shutdown not implemented          |
| 9   | **shutdown() on never-spawned client is no-op** — call shutdown without calling spawn first      | RED — no guard for null child                      |

#### AC#4: kill() resource cleanup

| #   | Test                                                                                                       | Status                                                     | Failure Reason |
| --- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------- |
| 10  | **kill() clears all pending timers and rejects promises** — verify promises reject with "McpClient killed" | RED — timer clearing and promise rejection not implemented |
| 11  | **kill() called twice is idempotent** — no crash on second call                                            | RED — idempotent kill not implemented                      |

#### AC#5: JSON parse hardening

| #   | Test                                                                                                                            | Status                                                   | Failure Reason |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | -------------- |
| 12  | **malformed JSON line is skipped, valid JSON after it still resolves** — inject garbage line then valid response                | RED — try/catch around JSON.parse not in stream listener |
| 13  | **notification messages (method: "notifications/\*", no id) are consumed silently** — overlaps with test #2 but at parser level | RED — notification detection not in stream listener      |

#### AC#6: Stderr capture

| #   | Test                                                                                                              | Status                                        | Failure Reason |
| --- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | -------------- |
| 14  | **stderr data is logged with [MCP stderr] prefix** — inject stderr chunk, verify console.error called with prefix | RED — stderr listener not attached in spawn() |

#### AC#7: Test regression

| #   | Test                                                        | Status                                                                                 | Failure Reason |
| --- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------- |
| 15  | **Verify all existing tests still pass: RUN `node --test`** | RED — internal refactors may break existing behavior if backward compat not maintained |

#### AC#8: Debug instrumentation

| #   | Test                                                                                                      | Status                                      | Failure Reason |
| --- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------- | -------------- |
| 16  | **MEMTRACE_DEBUG=1 emits [McpClient] lines to stderr** — run with env var, verify structured debug output | RED — debug guards and emit not implemented |
| 17  | **MEMTRACE_DEBUG=0 (or unset) emits no [McpClient] lines** — verify clean stderr                          | RED — env var guard not implemented         |

---

## Data Factories / Test Infrastructure

No data factories needed for this story. Test infrastructure requirements:

- **Mock stdin stream** (Readable) — for simulating MCP server responses in unit tests
- **Mock stdout stream** (Writable) — for capturing client output
- **Mock child process** — for testing spawn/shutdown/kill lifecycle
- **Spy on console.error** — for verifying stderr/debug output

---

## Fixtures

No external fixtures needed. The existing test file uses `execFile` integration tests via `runAdapter()`. New tests will need:

- **MockChildProcess helper** — a factory function returning a fake ChildProcess with controllable stdin, stdout, stderr, and exit event
- **ControlledClock helper** — for deterministic timeout testing (fake timers or manual Promise control)

---

## Mock Requirements

### Child Process Mock

| Property             | Type            | Purpose                                       |
| -------------------- | --------------- | --------------------------------------------- |
| `stdin`              | `Writable` stub | Track `.end()` and `.destroy()` calls         |
| `stdout`             | `Readable`      | Push JSON lines to simulate MCP responses     |
| `stderr`             | `Readable`      | Push data to simulate stderr output           |
| `on(event, handler)` | Function        | Capture listener registration, trigger `exit` |
| `kill(signal)`       | Function        | Track kill calls                              |
| `pid`                | number          | Return fake PID                               |

---

## Required Attributes

No `data-testid` attributes required (not a UI project).

---

## Implementation Checklist

### Test: AC#1 — out-of-order responses correctly dispatched (test #1)

**Tasks to make this test pass:**

- [ ] Add `_activeRequests = new Map()` to McpClient constructor
- [ ] Move stdout `data` listener from per-request to single stream listener in `spawn()`
- [ ] In stream listener: parse JSON → extract `id` → `_activeRequests.get(id).resolve(data)` → delete from map
- [ ] Handle unknown id (not in map) by ignoring silently
- [ ] Run test: `node --test _bmad/scripts/memtrace/memtrace-adapter.test.mjs`
- [ ] ✅ Test passes (green phase)

**Estimated Effort:** 0.5 hours

### Test: AC#1 — notifications silently consumed (test #2)

**Tasks to make this test pass:**

- [ ] In stream listener, check if parsed message has no `id` and `method` starts with `"notifications/"`
- [ ] If notification, skip dispatch (don't resolve/reject any promise)
- [ ] Run test: `node --test _bmad/scripts/memtrace/memtrace-adapter.test.mjs`
- [ ] ✅ Test passes (green phase)

**Estimated Effort:** 0.25 hours

### Test: AC#2 — timeout with phase (test #4)

**Tasks to make this test pass:**

- [ ] Add `phase` parameter to `withTimeout(promise, ms, phase)`
- [ ] On timeout, throw error: `Query timed out after ${ms}ms (phase: ${phase})`
- [ ] Update callers (`spawn`, `handshake`, `sendRequest`) to pass phase
- [ ] Run test: `node --test _bmad/scripts/memtrace/memtrace-adapter.test.mjs`
- [ ] ✅ Test passes (green phase)

**Estimated Effort:** 0.5 hours

### Test: AC#2 — timeout cleanup in sendRequest (test #5)

**Tasks to make this test pass:**

- [ ] In `sendRequest`, on timeout: remove id from `_activeRequests`, destroy `child.stdin`
- [ ] Run test: `node --test _bmad/scripts/memtrace/memtrace-adapter.test.mjs`
- [ ] ✅ Test passes (green phase)

**Estimated Effort:** 0.25 hours

### Test: AC#3 — shutdown removes listeners (test #7)

**Tasks to make this test pass:**

- [ ] In `shutdown()`: after child exits (or 2s timeout), remove stdout and stderr listeners
- [ ] Track listener references for removal (store in instance properties)
- [ ] Run test: `node --test _bmad/scripts/memtrace/memtrace-adapter.test.mjs`
- [ ] ✅ Test passes (green phase)

**Estimated Effort:** 0.5 hours

### Test: AC#3 — shutdown idempotent (tests #8, #9)

**Tasks to make this test pass:**

- [ ] Guard `shutdown()`: if `this.child` is null, return immediately
- [ ] Guard `shutdown()`: if `this.child.exitCode !== null`, return immediately
- [ ] Run test: `node --test _bmad/scripts/memtrace/memtrace-adapter.test.mjs`
- [ ] ✅ Test passes (green phase)

**Estimated Effort:** 0.25 hours

### Test: AC#4 — kill() cleanup (tests #10, #11)

**Tasks to make this test pass:**

- [ ] In `kill()`: iterate `_activeRequests`, reject all with `Error("McpClient killed")`
- [ ] Clear all pending `withTimeout` timers
- [ ] Remove stdout/stderr listeners
- [ ] `child.stdin.end()` → `child.kill('SIGTERM')`
- [ ] Set `this.child = null`, clear map
- [ ] Guard: if `this.child` is null, return
- [ ] Run test: `node --test _bmad/scripts/memtrace/memtrace-adapter.test.mjs`
- [ ] ✅ Test passes (green phase)

**Estimated Effort:** 0.5 hours

### Test: AC#5 — JSON parse hardening (tests #12, #13)

**Tasks to make this test pass:**

- [ ] Wrap `JSON.parse(line)` in try/catch in stream listener
- [ ] On failure, if line starts with `{`, log `WARNING: [McpClient] Malformed JSON (${err.message}): ${line.slice(0, 120)}`
- [ ] Skip malformed line (continue to next)
- [ ] Handle empty/whitespace-only lines (skip silently)
- [ ] Run test: `node --test _bmad/scripts/memtrace/memtrace-adapter.test.mjs`
- [ ] ✅ Test passes (green phase)

**Estimated Effort:** 0.25 hours

### Test: AC#6 — stderr capture (test #14)

**Tasks to make this test pass:**

- [ ] In `spawn()`: attach `child.stderr.on('data')` listener
- [ ] Log each chunk: `console.error('[MCP stderr]', line.trim())`
- [ ] Handle multiline chunks (split by `\n`)
- [ ] Accumulate partial lines across chunks (buffer pattern)
- [ ] Run test: `node --test _bmad/scripts/memtrace/memtrace-adapter.test.mjs`
- [ ] ✅ Test passes (green phase)

**Estimated Effort:** 0.25 hours

### Test: AC#8 — debug instrumentation (tests #16, #17)

**Tasks to make this test pass:**

- [ ] Add `MEMTRACE_DEBUG=1` guard
- [ ] Emit `[McpClient] spawn start|ok|error`
- [ ] Emit `[McpClient] handshake start|ok|error`
- [ ] Emit `[McpClient] request:<id> start|ok|timeout|error`
- [ ] Emit `[McpClient] shutdown start|ok|error`, `kill listener_cleanup`
- [ ] Verify no credential/token leak in debug output
- [ ] Run test: `node --test _bmad/scripts/memtrace/memtrace-adapter.test.mjs`
- [ ] ✅ Test passes (green phase)

**Estimated Effort:** 0.5 hours

### Test: AC#7 — regression verification

**Tasks to make this test pass:**

- [ ] Run `node --test _bmad/scripts/memtrace/memtrace-adapter.test.mjs` before starting — record baseline
- [ ] Ensure backward compat: all public API signatures unchanged
- [ ] After all refactors, run full suite and verify zero regressions
- [ ] ✅ Test passes (green phase)

**Estimated Effort:** 0.5 hours (verification only; the real effort is preserving compat during refactor)

---

## Running Tests

```bash
# Run full test suite
node --test _bmad/scripts/memtrace/memtrace-adapter.test.mjs

# Run with debug output
MEMTRACE_DEBUG=1 node --test _bmad/scripts/memtrace/memtrace-adapter.test.mjs

# Run specific test by name pattern (node:test --test-name-pattern)
node --test --test-name-pattern "out-of-order" _bmad/scripts/memtrace/memtrace-adapter.test.mjs

# Run with test coverage
node --experimental-test-coverage --test _bmad/scripts/memtrace/memtrace-adapter.test.mjs
```

---

## Red-Green-Refactor Workflow

### RED Phase (Complete) ✅

**TEA Agent Responsibilities:**

- ✅ 17 red-phase test scenarios identified (14 new + 3 regression)
- ✅ Mock requirements documented (ChildProcess mock)
- ✅ Implementation checklist created per test
- ✅ All existing test suite integrity required (AC#7)
- ✅ Command-line execution instructions provided

**Verification:**

- All identified scenarios target unimplemented features
- Existing test suite is the regression safety net
- Implementation checklist maps ACs → code tasks granularly

---

### GREEN Phase (DEV Team)

1. **Start with AC#1** (out-of-order responses) — this is the foundational refactor that enables the rest
2. **Implement active-request registry** (`Map<id, {resolve, reject}>`)
3. **Move to single stream listener** pattern
4. **Add AC#2 timeout hardening** on top of the new registry
5. **Add AC#3 shutdown cleanup** and AC#4 kill cleanup
6. **Add AC#5 JSON hardening** and AC#6 stderr capture
7. **Add AC#8 debug instrumentation**
8. **Run full suite after each milestone** to catch regressions

**Key Principles:**

- One AC at a time
- Run tests after every change
- Never break existing tests (AC#7 is non-negotiable)

---

### REFACTOR Phase (After All Tests Pass)

1. Verify 30+ existing tests + 17 new tests all pass
2. Check for listener leak patterns across all code paths
3. Verify `clearTimeout` in every `finally` block
4. Check no credentials leak in debug output
5. Verify cross-platform: ensure `kill('SIGTERM')` and stdin patterns work on Windows

---

## AC-to-Test Traceability Matrix

| AC   | Test Scenario                               | Type       | Priority |
| ---- | ------------------------------------------- | ---------- | -------- |
| AC#1 | Out-of-order dispatch by id                 | Unit       | P0       |
| AC#1 | Notifications consumed silently             | Unit       | P0       |
| AC#1 | Unknown id ignored                          | Unit       | P1       |
| AC#2 | TimeoutError with phase field               | Unit       | P0       |
| AC#2 | Timeout removes from registry               | Unit       | P0       |
| AC#2 | Spawn timeout cleans up listeners           | Unit       | P1       |
| AC#3 | Shutdown removes stdout/stderr listeners    | Unit       | P0       |
| AC#3 | Shutdown on dead child resolves immediately | Unit       | P0       |
| AC#3 | Shutdown on never-spawned client no-op      | Unit       | P1       |
| AC#4 | kill() clears timers, rejects promises      | Unit       | P0       |
| AC#4 | kill() called twice idempotent              | Unit       | P1       |
| AC#5 | Malformed JSON skipped, next valid resolves | Unit       | P0       |
| AC#5 | Notifications consumed at parser level      | Unit       | P1       |
| AC#6 | stderr logged with [MCP stderr] prefix      | Unit       | P1       |
| AC#7 | Full existing suite passes                  | Regression | P0       |
| AC#8 | Debug output emitted with MEMTRACE_DEBUG=1  | Unit       | P1       |
| AC#8 | No debug output without MEMTRACE_DEBUG=1    | Unit       | P1       |

---

## Next Steps

1. Begin implementation with AC#1 (out-of-order responses) — the foundational refactor
2. Implement additional ACs in order (AC#2 → AC#3 → AC#4 → AC#5 → AC#6 → AC#8)
3. Run full suite after every AC
4. Run AC#7 (regression) continuously — never break existing tests

---

## Knowledge Base References Applied

- **test-levels-framework.md** — All tests at unit level (pure Node.js module, no external dependencies)
- **test-priorities-matrix.md** — P0-P3 classification applied to AC-to-test mapping
- **test-quality.md** — Given-When-Then structure, determinism, isolation principles applied

---

**Generated by BMad TEA Agent (Murat)** — 2026-05-29
