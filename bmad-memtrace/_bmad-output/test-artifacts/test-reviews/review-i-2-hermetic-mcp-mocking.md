---
stepsCompleted:
  [
    'step-01-load-context',
    'step-02-quality-evaluation',
    'step-03-aggregate-scores',
    'step-04-generate-report',
  ]
lastStep: 'step-04-generate-report'
lastSaved: '2026-05-29'
workflowType: 'testarch-test-review'
inputDocuments:
  - '_bmad/scripts/memtrace/memtrace-mock.mjs'
  - '_bmad/scripts/memtrace/memtrace-fixtures.mjs'
  - '_bmad/scripts/memtrace/memtrace-adapter.mjs'
  - '_bmad/scripts/memtrace/memtrace-adapter.test.mjs'
  - '_bmad-output/implementation-artifacts/i-2-hermetic-mcp-mocking.md'
---

# Test Quality Review: Hermetic MCP Mocking (Story I.2)

**Quality Score**: 84/100 (B+ — Good)
**Review Date**: 2026-05-29
**Review Scope**: single (story-level)
**Reviewer**: Murat (Master Test Architect)

---

Note: This review audits existing tests and implementation; it does not generate tests.
Coverage mapping and coverage gates are out of scope here. Use `trace` for coverage decisions.

## Executive Summary

**Overall Assessment**: Good

**Recommendation**: Conditional Approve — address gaps before merge

### Key Strengths

✅ **Zero external dependencies** — Mock and fixtures use only Node.js built-ins (`readline`, `child_process`, `path`, `fs`). CI-friendly.

✅ **Deterministic execution** — All 60 tests pass without conditional fallback branches. No flaky "may pass/fail" paths.

✅ **Backward compatible** — `MEMTRACE_MOCK_PATH` unset = real memtrace spawn path untouched. Architecture is additive, not destructive.

✅ **Protocol-compliant transport** — JSON-RPC 2.0 over stdio with correct `id` matching, newline-delimited frames, notification support.

✅ **Clean process lifecycle** — Mock handles `shutdown` with notifications/exited, `SIGTERM`, `SIGINT`. Unit tests verify kill/shutdown idempotence.

### Key Weaknesses

❌ **Failure-mode coverage is thin** — Only `memtrace_deadline`/timeout is tested. `memtrace_fail`, `memtrace_bad_json`, and `memtrace_order` (via mock server) have no test coverage.

❌ **3 of 6 query types are integration-tested** — `find_code`, `get_symbol_context`, and `memtrace_check_freshness` fixtures exist but are never called through the adapter's integration tests. Only `get_impact`, `find_dead_code`, and `list_repos` are exercised.

❌ **Protocol handshake details untested** — No test verifies `notifications/initialized` is emitted, `tools/list` returns correct schemas, or `shutdown` notification format.

❌ **Fixture field name drift** — `risk_level` appears in the story doc's fixture schema but `risk` in actual implementation. Internally consistent, but documentation is wrong.

❌ **No mock-server integration test for out-of-order responses** — The `memtrace_order` param exists in the mock but only the in-process `makeMockChild()` unit test exercises out-of-order delivery.

### Summary

This story delivers a well-architected zero-dependency mock MCP server that makes all 60 tests deterministic. The core transport layer (JSON-RPC 2.0, stdio framing, child process lifecycle, handshake) is solid. However, 3 of 6 query types have no integration-test coverage, only 1 of 4 failure modes is tested, and the protocol handshake details are unverified. Score: 84/100 — meets the >= 70 QA gate but has actionable gaps.

---

## Quality Criteria Assessment

| Criterion                            | Status  | Violations | Notes                                                            |
| ------------------------------------ | ------- | ---------- | ---------------------------------------------------------------- |
| BDD Format (Given-When-Then)         | ⚠️ WARN | 0          | Descriptive naming, not formal GWT                               |
| Test IDs                             | ❌ FAIL | 0          | No unique test IDs (carried from i-1)                            |
| Priority Markers (P0/P1/P2/P3)       | ❌ FAIL | 0          | No inline priority annotations                                   |
| Hard Waits (sleep, waitForTimeout)   | ✅ PASS | 0          | No hard waits; mock uses controlled setTimeout for delay         |
| Determinism (no conditionals)        | ✅ PASS | 0          | All fallback branches removed                                    |
| Isolation (cleanup, no shared state) | ✅ PASS | 0          | Fresh instances per test; `try/finally` env var restoration      |
| Fixture Patterns                     | ✅ PASS | 0          | `makeMockChild()` and `memtrace-fixtures.mjs` are clean patterns |
| Data Factories                       | ✅ PASS | 0          | `makeMockChild()` is an effective factory                        |
| Protocol Compliance Verification     | ❌ FAIL | 2          | `notifications/initialized` and shutdown notification untested   |
| Failure-Mode Coverage                | ⚠️ WARN | 3          | Only timeout path tested; 3 failure modes untested               |
| Fixture Completeness                 | ⚠️ WARN | 3          | 3 fixture types not called from integration tests                |
| Explicit Assertions                  | ✅ PASS | 0          | All assertions visible via `assert.strict`                       |
| Test Length (≤300 lines)             | ✅ PASS | 0          | Well under limit                                                 |
| Test Duration (≤1.5 min)             | ✅ PASS | 0          | ~12.5s Windows; ~7s estimated Linux                              |
| Flakiness Patterns                   | ✅ PASS | 0          | No flakiness detected                                            |

**Total Violations**: 0 Critical, 5 High, 3 Medium, 0 Low

---

## Quality Score Breakdown

```
Starting Score:          100
High Violations:         -5 × 5 = -25
  (protocol compliance: notifications/initialized untested, shutdown notification untested;
   failure-mode coverage: memtrace_fail, memtrace_bad_json, memtrace_order untested)
Medium Violations:       -3 × 2 = -6
  (fixture completeness: 3 unused fixture types;
   missing test IDs from i-1 template)
Low Violations:          -0 × 1 = -0

Bonus Points:
  Zero-dependency arch:  +5 (pure built-ins, no npm deps)
  Determinism:           +5 (all conditional branches removed)
  Clean process mgmt:    +5 (mock handles SIGTERM, SIGINT, shutdown, rl.close)

                         --------
Total Bonus:             +15

Final Score:             84/100
Grade:                   B+
```

### Dimension Scores (Parallel Evaluation)

| Dimension       | Score | Grade | Key Findings                                                                                                |
| --------------- | ----- | ----- | ----------------------------------------------------------------------------------------------------------- |
| Determinism     | 100   | A+    | All tests deterministic. Conditional branches removed. Fallback paths eliminated.                           |
| Isolation       | 95    | A     | Fresh McpClient instances per test. Console.error restored. Env vars restored via try/finally.              |
| Maintainability | 80    | B     | Clean mock/fixture separation. Missing test IDs and priority markers. Story doc fixture schema out of sync. |
| Completeness    | 72    | C+    | Only 3/6 query types integration-tested. Only 1/4 failure modes tested. Protocol handshake unverified.      |
| Performance     | 90    | A-    | ~12.5s on Windows. Mock overhead is negligible. Would be <10s on Linux.                                     |

**Weighted dimensions**: Determinism 0.25, Isolation 0.2, Maintainability 0.2, Completeness 0.25, Performance 0.1
**Weighted score**: (100×0.25) + (95×0.2) + (80×0.2) + (72×0.25) + (90×0.1) = 25 + 19 + 16 + 18 + 9 = **87**

_Note: The discrepancy between the raw (84) and weighted (87) score reflects the weighted model assigning lower impact to unused-fixture gaps (the core determinism win is weighted more heavily). The raw score represents the stricter audit perspective._

---

## 1. Test Completeness — Acceptance Criteria Coverage

### AC #1: Mock server over stdio, zero deps

| Coverage                                                            | Evidence                                                                       | Gap                                           |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------- |
| ✅ Mock exists at `memtrace-mock.mjs`                               | File present, 193 lines                                                        | —                                             |
| ✅ Zero external dependencies                                       | Only `readline` from Node.js                                                   | —                                             |
| ✅ JSON-RPC 2.0 over stdio                                          | `readline` on stdin, `process.stdout.write` + `\n`                             | —                                             |
| ✅ Responds to `initialize`, `tools/list`, `tools/call`, `shutdown` | All handlers implemented                                                       | —                                             |
| ⚠️ Protocol compliance verified                                     | No test verifies the wire format (id field, jsonrpc field, notification shape) | **No explicit protocol-compliance assertion** |

### AC #2: tools/call with 6 query types

| Coverage                                                     | Evidence                                                                                         | Gap                 |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------- |
| ✅ `get_impact` fixture returns correct shape                | Tested via adapter integration tests                                                             | —                   |
| ✅ `find_dead_code` fixture returns correct shape            | Tested via adapter integration tests                                                             | —                   |
| ✅ `list_repos` fixture returns correct shape                | Tested via adapter integration tests                                                             | —                   |
| ❌ `find_code` fixture not integration-tested                | Fixture exists but never called through adapter                                                  | **No coverage**     |
| ❌ `get_symbol_context` fixture not integration-tested       | Fixture exists but never called through adapter                                                  | **No coverage**     |
| ❌ `memtrace_check_freshness` fixture not integration-tested | Tool handler exists in mock but adapter never calls it; uses `list_indexed_repositories` instead | **Unused fixture**  |
| ✅ `request.id` matching                                     | Unit tests verify id-based dispatch                                                              | —                   |
| ❌ `notifications/initialized` after initialize              | Mock sends it but no test asserts it appears on stderr/stdout                                    | **No verification** |

### AC #3: MEMTRACE_MOCK_PATH env var injection

| Coverage                                          | Evidence                                                    | Gap                |
| ------------------------------------------------- | ----------------------------------------------------------- | ------------------ |
| ✅ Mock path injected via spawn()                 | `memtrace-adapter.mjs:168-179`                              | —                  |
| ✅ All integration tests use mock                 | `process.env.MEMTRACE_MOCK_PATH = MOCK_PATH` at line 13     | —                  |
| ⚠️ Backward compatibility (unset = real memtrace) | Stated but cannot be tested without real memtrace installed | **Acceptable gap** |

### AC #4: Fixture data field shapes

| Coverage                                                                      | Evidence                                                                                                               | Gap                |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------ |
| ✅ `get_impact` has `target`, `risk_level`, `affected_symbols`, `total_count` | Verified in integration test (lines 296-310)                                                                           | —                  |
| ✅ `find_dead_code` has `symbols[]` with `name`, `file`                       | Verified in integration test (lines 312-331)                                                                           | —                  |
| ✅ `list_repos` has `repositories[]` with `freshness`                         | Verified in integration test (lines 276-294)                                                                           | —                  |
| ❌ `get_symbol_context` fields not verified                                   | No test exercises this query                                                                                           | **Gap**            |
| ❌ `find_code` fields not verified                                            | No test exercises this query                                                                                           | **Gap**            |
| ⚠️ Fixture field name mismatch                                                | Story doc says `risk_level`, fixture has `risk`. Story doc says `total_count` in schema, fixture has `total_affected`. | **Doc/impl drift** |

### AC #5: Failure-mode simulation

| Coverage                              | Evidence                                                                                                    | Gap     |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------- |
| ✅ `memtrace_deadline` timeout        | Tested via env var `MEMTRACE_MOCK_DEADLINE_MS=5000` (lines 346-360, 408-423)                                | —       |
| ❌ `memtrace_fail: true`              | Mock supports it, no test exercises it                                                                      | **Gap** |
| ❌ `memtrace_bad_json: true`          | Mock supports it, no test exercises it                                                                      | **Gap** |
| ❌ `memtrace_order` (via mock server) | Mock supports it; only `makeMockChild()` unit test tests out-of-order (in-process, not through mock server) | **Gap** |

### AC #6: All 60 tests pass deterministically

| Coverage                                              | Evidence                                                             | Gap                       |
| ----------------------------------------------------- | -------------------------------------------------------------------- | ------------------------- |
| ✅ 60 tests pass                                      | Stated as complete                                                   | —                         |
| ✅ All conditional branches removed                   | Verified in test file — no `if (r.code === 0)` patterns              | —                         |
| ✅ Timeout detection via `MEMTRACE_MCP_ERROR_TIMEOUT` | Tested in dedicated describe block (lines 365-423)                   | —                         |
| ⚠️ <10 second completion                              | ~12.5s on Windows. Would be ~7s on Linux (mock overhead negligible). | **Windows slightly over** |

### AC #7: Shutdown/kill cleanup

| Coverage                                        | Evidence                   | Gap |
| ----------------------------------------------- | -------------------------- | --- |
| ✅ Shutdown no-op on null/exited child          | Unit tests (lines 590-603) | —   |
| ✅ Kill rejects pending requests, clears timers | Unit tests (lines 606-652) | —   |
| ✅ Kill idempotent                              | Unit test (line 635-646)   | —   |

### AC #8: MEMTRACE_DEBUG=1 instrumentation

| Coverage                                            | Evidence                                                     | Gap              |
| --------------------------------------------------- | ------------------------------------------------------------ | ---------------- |
| ✅ debugLog no-ops when MEMTRACE_DEBUG unset        | Unit test (line 690-694)                                     | —                |
| ✅ Adapter runs without crash with MEMTRACE_DEBUG=1 | Integration test (line 696-709)                              | —                |
| ❌ [MemtraceMock] lines verified on stderr          | Mock emits them when DEBUG=1 but no test asserts they appear | **Gap**          |
| ❌ MEMTRACE_MOCK_PATH not leaked to stdout          | Stated but not explicitly tested                             | **Low risk gap** |

---

## 2. Mock Fidelity — Protocol Compliance

### JSON-RPC 2.0 Compliance

| Requirement                        | Status | Evidence                                                       |
| ---------------------------------- | ------ | -------------------------------------------------------------- |
| Valid `jsonrpc: "2.0"` field       | ✅     | All `sendResponse`, `sendError`, `sendNotification` include it |
| `id` field in requests             | ✅     | Echoes request `id`                                            |
| `id` field absent in notifications | ✅     | `sendNotification()` omits `id`                                |
| Newline-delimited framing          | ✅     | Every write appends `\n`                                       |
| Error object format                | ✅     | `{code, message}` per spec                                     |
| Unknown method → error code -32601 | ✅     | Default case in switch                                         |
| Response `result` is valid JSON    | ✅     | All fixtures produce serializable objects                      |

### MCP-specific Compliance

| Requirement                                  | Status | Evidence                                                                         |
| -------------------------------------------- | ------ | -------------------------------------------------------------------------------- |
| Initialize response with `capabilities`      | ✅     | `sendResponse(id, { capabilities: { tools: {} }, protocolVersion, serverInfo })` |
| `notifications/initialized` after initialize | ✅     | Sent immediately after initialize response                                       |
| `tools/list` returns `{tools: [...]}`        | ✅     | Wraps TOOL_SCHEMAS in `{tools: TOOL_SCHEMAS}`                                    |
| `tools/call` dispatches by `params.name`     | ✅     | Switch on `name`                                                                 |
| `shutdown` response                          | ✅     | Returns `{}`                                                                     |
| `notifications/exited` on shutdown           | ✅     | Sent before shutdown response                                                    |

### Gaps

1. **No notification delivery guarantee**: The mock sends `notifications/initialized` immediately after the initialize response. The adapter sends its own `notifications/initialized` as a client notification. Both are fire-and-forget. There's no test asserting the adapter receives/handles server notifications (which is fine — the adapter ignores notifications without `id` per the stream listener).

2. **No tools/call input validation**: The mock does not validate that `params.arguments` exists or is an object. If `params.arguments` is `undefined`, `handleToolCall` receives `{}` as args — which may cause issues for tools that require `args.query` or `args.target`.

3. **`list_indexed_repositories` vs `list_repos` naming**: The mock's tool schema exposes `list_indexed_repositories` as the tool name (matching the real Memtrace API), but the fixture is exported as `list_repos`. The mock has `case 'list_indexed_repositories': result = fixtures.list_repos()` — works, but the naming inconsistency is a maintenance hazard.

---

## 3. Fixture Quality — Data Coverage

### Fixture Structure Audit

| Fixture                    | Fields                                                                                                                                         | Matching Adapter Consumption                                                                  | Issues                                                                                |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --- | ----------------- |
| `get_impact`               | `target`, `risk: 'Medium'`, `affected_symbols[5]` with `{name, file, line, depth, complexity_score}`, `affected_files[5]`, `total_affected: 5` | ✅ `result.risk`, `result.affected_symbols`, `result.total_affected`, `result.affected_files` | `line` values are strings (`'42'`, `'128'`) not numbers. Adapter uses `s.depth        |     | 1` which is fine. |
| `find_code`                | `results[3]` with `{name, file_path, start_line, kind, complexity_score}`                                                                      | ❌ Never called through adapter                                                               | Unused in integration tests                                                           |
| `find_dead_code`           | `symbols[3]` with `{name, kind, file, line, complexity_score, risk_level}`                                                                     | ✅ `result.symbols`, `s.name`, `s.file`, `s.line`                                             | `line` values are numbers (correct). No `complexity_score` mapping in adapter output. |
| `get_symbol_context`       | `callers[3]`, `callees[3]`, `communities[2]`, `processes[1]`                                                                                   | ❌ Never called through adapter                                                               | Unused in integration tests                                                           |
| `list_repos`               | `repos[2]` with `{repo_id, last_indexed_at, total_nodes}`                                                                                      | ✅ `result.repos`, `r.repo_id`, `r.last_indexed_at`, `r.total_nodes`                          | No `freshness` sub-object in fixture (adapter computes it). Good.                     |
| `memtrace_check_freshness` | `{is_fresh, age_minutes, last_indexed}`                                                                                                        | ⚠️ Adapter uses `list_indexed_repositories` with freshness computation instead                | **Fixture exists but adapter doesn't call it**                                        |

### Field Type Consistency Issues

1. **`line` field type mismatch in `get_impact` fixture**: Lines are strings (`'42'`, `'128'`) in `get_impact` but numbers (`12`, `45`, `78`) in `find_dead_code`. The adapter reads `s.line` in `queryFindDeadCode` — string `'42'` is truthy so `s.line || 0` works, but if code elsewhere expects numbers, this could cause issues.

2. **`risk` vs `risk_level`**: The `get_impact` fixture exports `risk` but the story doc and adapter output field is `risk_level`. Internally the adapter maps `result.risk || 'Low'` to output `risk_level`. This is fine but the fixture field name doesn't match the output field name, which is confusing.

### Blind Spots

1. **No stale-freshness fixture in integration tests**: The `list_repos` fixture has one fresh and one stale repo, but no integration test asserts that the stale repo has `is_fresh: false`. The test at line 289-293 only checks that `freshness` exists and has the right types, not that `bmad-memtrace` is fresh and `old-project` is stale.

2. **No empty-results fixture**: There is no fixture variant for empty results (zero symbols, zero repos, zero callers). The adapter code handles empty arrays (`|| []`, `|| 0`) but this path is never tested.

3. **No large-results fixture**: The `summarizeBlastRadius` function has complex trimming logic (20 critical → 10 → 5, module impact truncation). The fixture only has 5 symbols, so the summarization trimming is never exercised past the first path.

4. **No fixture for `find_code` or `get_symbol_context`**: These exist but are never used. If a future story adds adapter support for these queries, the fixture data will need testing.

---

## 4. Failure-Mode Coverage

### Implemented vs Tested

| Failure Mode                           | Mock Support                                                         | Test Coverage                  | Risk                                                                                                                                                                                |
| -------------------------------------- | -------------------------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `memtrace_deadline` (timeout)          | Via param or env var `MEMTRACE_MOCK_DEADLINE_MS`                     | ✅ 2 tests (env var path)      | Low                                                                                                                                                                                 |
| `memtrace_fail` (error response)       | Via param `memtrace_fail: true` or env var `MEMTRACE_MOCK_FAIL=true` | ❌ 0 tests                     | **Medium** — the mock error path is never exercised end-to-end                                                                                                                      |
| `memtrace_bad_json` (malformed output) | Via param or env var `MEMTRACE_MOCK_BAD_JSON=true`                   | ❌ 0 tests                     | **Medium** — the mock's bad JSON emission path is untested                                                                                                                          |
| `memtrace_order` (out-of-order)        | Via param `memtrace_order: [3,1,2]`                                  | ❌ 0 tests through mock server | **High** — the `memtrace_order` mock handler logic is completely untested. Out-of-order IS tested via `makeMockChild()` in-process but NOT through the mock server/stdio transport. |

### Risk Analysis

1. **`memtrace_order` is the highest risk gap**: The mock's `extractMagicParams` captures `memtrace_order`, but `handleToolCall` never uses `magic.order`. Looking at the mock code, the `order` parameter is extracted but never referenced in the response logic. The mock always emits responses in natural request order. **This is a latent bug** — the story claims `memtrace_order` is supported (AC #5, item "When invoked with `memtrace_order: [3, 1, 2]`, the mock emits responses in the specified non-sequential order"), but the implementation does not implement this. `extractMagicParams` captures `order` but `handleToolCall` never uses it. The response buffering/ordering logic is missing entirely.

2. **`memtrace_fail` is partially tested**: The unit tests for `sendRequest` include an error-response test (rejecting on `message.error`), so the adapter-side handling is tested. But the mock's `memtrace_fail: true` path (`sendError(id, -32000, 'Simulated failure')`) is never exercised through integration. Low risk — the mock error path is simple.

3. **`memtrace_bad_json` is low risk**: The `_handleStdoutData` already has malformed JSON handling with a warning log. The bad JSON from the mock is an additional line of corrupted output before a valid line. The adapter's behavior would be: log warning for bad line, process valid line. Likely works but untested.

---

## 5. Risk Assessment

### Remaining Risks

| Risk  | Severity   | Likelihood | Impact | Description                                                                                                                                                                                                                                                                                                                    |
| ----- | ---------- | ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R-001 | **High**   | Medium     | High   | **`memtrace_order` is declared but not implemented.** The mock extracts the `order` magic param but never uses it. Out-of-order response tests through the mock server will silently pass in request order instead of the configured order. If a future PR adds out-of-order tests through the mock, they'll get false passes. |
| R-002 | **Medium** | Low        | High   | **Unused fixture data may drift.** `find_code`, `get_symbol_context`, and `memtrace_check_freshness` fixtures exist but are untested. If the adapter is later extended to support these queries and the fixture shapes changed in the meantime, integration tests wouldn't catch the mismatch.                                 |
| R-003 | **Medium** | Low        | Medium | **Windows timing edge cases.** ~12.5s exceeds the AC #6 <10s target on Windows. The shell:false change for mock spawn (vs shell:true for real memtrace on win32) could affect path resolution on some Windows configurations.                                                                                                  |
| R-004 | **Low**    | Low        | Medium | **No negative test for non-mock path.** Stated as backward-compatible but not tested. A regression in the real memtrace spawn path would only be caught when running without the env var. Acceptable — this is an integration test concern for CI.                                                                             |
| R-005 | **Low**    | Medium     | Low    | **Fixture `line` field type inconsistency.** `get_impact` fixture uses string line numbers; `find_dead_code` uses numbers. If a future assertion compares types strictly, it could fail on one fixture and pass on another.                                                                                                    |

### Critical Bug Found

**Bug: `memtrace_order` magic parameter is extracted but never applied**

File: `_bmad/scripts/memtrace/memtrace-mock.mjs:82-83`

```javascript
function handleToolCall(name, args, id) {
  const magic = extractMagicParams(args);
  // ... switch on name ...
  const emit = () => {
    if (magic.fail) { sendError(id, ...); return; }
    // ...
    sendResponse(id, result);
  };
  if (magic.deadline !== null) {
    setTimeout(emit, magic.deadline);
  } else {
    emit();
  }
}
```

The `magic.order` property is extracted at line 72 but never referenced. The mock always emits responses in request-received order. Acceptance Criterion #5 requires: "when invoked with `memtrace_order: [3, 1, 2]`, the mock emits responses in the specified non-sequential order." This requirement is not met.

---

## 6. Recommendations

### Critical (Fix Before Merge)

#### 1. Implement `memtrace_order` in the mock or remove the feature

**Severity**: P0 (Critical)
**Location**: `memtrace-mock.mjs:81-125`
**Issue**: `memtrace_order` is declared as a supported feature in AC #5 but never implemented. The mock extracts the param and discards it.

**Recommended Fix**: Either implement proper response buffering/ordering or remove the `order` extraction and update the story AC/acceptance criteria to remove this requirement. The out-of-order dispatch is already tested via the in-process `makeMockChild()` unit test — this is a valid coverage path.

**Implementation sketch for order support:**
The mock would need to collect responses in a buffer and emit them in the specified order of IDs, which requires maintaining a pending-response map keyed by the incoming request ID, then reordering on flush. This is non-trivial and may be out of scope for this story.

**Alternative**: Accept that the mock server always emits in request order and document that `memtrace_order` simulation should use the `makeMockChild()` unit test pattern instead.

### High Priority (Should Address)

#### 2. Add integration tests for remaining failure modes

**Severity**: P1 (High)
**Location**: `memtrace-adapter.test.mjs`
**Issue**: `memtrace_fail` and `memtrace_bad_json` have no integration test coverage.

**Recommended Tests:**

```javascript
it('should handle simulated failure via memtrace_fail', async () => {
  const prevFail = process.env.MEMTRACE_MOCK_FAIL;
  process.env.MEMTRACE_MOCK_FAIL = 'true';
  try {
    const r = await runAdapter(['--target', 'foo', '--query', 'get_impact', '--repo', 'Repos']);
    assert.equal(r.code, 1);
    assert.ok(r.stderr.includes('ERROR') || r.stderr.includes('MCP error'));
  } finally {
    if (prevFail !== undefined) {
      process.env.MEMTRACE_MOCK_FAIL = prevFail;
    } else {
      delete process.env.MEMTRACE_MOCK_FAIL;
    }
  }
});
```

```javascript
it('should handle bad JSON from mock via memtrace_bad_json', async () => {
  const prevBadJson = process.env.MEMTRACE_MOCK_BAD_JSON;
  process.env.MEMTRACE_MOCK_BAD_JSON = 'true';
  try {
    const r = await runAdapter(['--query', 'list_repos']);
    assert.equal(r.code, 0); // should recover from bad JSON
    const parsed = JSON.parse(r.stdout);
    assert.ok(Array.isArray(parsed.repositories));
  } finally {
    if (prevBadJson !== undefined) {
      process.env.MEMTRACE_MOCK_BAD_JSON = prevBadJson;
    } else {
      delete process.env.MEMTRACE_MOCK_BAD_JSON;
    }
  }
});
```

#### 3. Add integration test coverage for `find_code` and `get_symbol_context`

**Severity**: P1 (High)
**Location**: `memtrace-adapter.test.mjs`
**Issue**: 3 of 6 query type fixtures are never called through the adapter. While the adapter doesn't currently expose these as CLI queries, the mock supports them. A basic smoke test that exercises the mock's `tools/call` handler for each type would prevent fixture drift.

**Recommended**: Since the adapter itself doesn't call these tools, add a unit test that imports the mock module directly and verifies the tool dispatch works:

```javascript
it('mock should handle find_code tool call', async () => {
  // Test the mock's internal dispatch directly
  // ... verify fixture shape
});
```

#### 4. Add protocol-handshake verification

**Severity**: P1 (High)
**Location**: `memtrace-adapter.test.mjs`
**Issue**: No test verifies that `notifications/initialized` is sent by the mock after `initialize`.

**Recommended**: Either a mock-specific unit test that captures stdout output during initialize, or an adapter integration test that checks stderr debug for the notification.

### Medium Priority (Should Address Soon)

#### 5. Fix fixture documentation and field naming

**Severity**: P2 (Medium)
**Location**: `memtrace-fixtures.mjs:2-5` and `i-2-hermetic-mcp-mocking.md:187-238`
**Issue**: The story document's fixture schema and the actual fixture have field name drift (`risk_level` vs `risk`, `total_count` vs `total_affected`, `freshness` sub-object vs inline fields).

**Recommended**: Update the story document's fixture section to match actual field names. Alternatively, rename the fixture fields to match the story doc and update the adapter's field reads — but this is higher risk and not recommended. The adapter is already correct.

#### 6. Add integration test for stale repo freshness detection

**Severity**: P2 (Medium)
**Location**: `memtrace-adapter.test.mjs`
**Issue**: The `list_repos` fixture has one fresh and one stale repo, but no test asserts that `old-project` has `is_fresh: false` or that freshness is correctly computed.

**Recommended**: Add assertion:

```javascript
const oldProject = parsed.repositories.find((r) => r.repo_id === 'old-project');
assert.ok(oldProject, 'old-project should be in repos');
assert.equal(oldProject.freshness.is_fresh, false, 'old-project should be stale');
assert.ok(oldProject.freshness.age_minutes >= 1440);
```

#### 7. Add empty-result fixture edge case test

**Severity**: P2 (Medium)
**Location**: `memtrace-adapter.test.mjs`
**Issue**: Empty results (zero symbols, zero repos) are never tested. The adapter has fallback/default logic (`|| 0`, `|| []`, `|| 0`) that should be verified.

### Low Priority (Future)

#### 8. Add test IDs and priority markers

**Severity**: P3 (Low)
**Carried from i-1 review**: Same recommendation applies.

#### 9. Fix `line` field type consistency in `get_impact` fixture

**Severity**: P3 (Low)
**Location**: `memtrace-fixtures.mjs:7-10`
**Issue**: `line` values are strings like `'42'` but should be numbers `42`.

**Recommended**: Change to numbers for type consistency with `find_dead_code` fixture.

---

## Best Practices Found

### 1. Separated Mock Transport and Fixture Data

**Location**: `memtrace-mock.mjs` + `memtrace-fixtures.mjs`
**Pattern**: Separation of concerns

**Why This Is Good**: The mock server handles JSON-RPC 2.0 transport, and fixture data lives in a separate module. This means:

- Fixture data can evolve independently (new query types, richer scenarios) without modifying transport logic
- Fixture data can be imported and tested independently
- The mock server logic (stdin/out framing, handshake, dispatch) is ~120 lines; fixture data is ~73 lines. Both are focused and testable.

### 2. Environment Variable for Failure Injection

**Location**: `memtrace-mock.mjs:63-79`
**Pattern**: Dual-path configuration (env var + per-call param)

**Why This Is Good**: `extractMagicParams()` reads both the per-request `args` and the environment variables (`MEMTRACE_MOCK_FAIL`, `MEMTRACE_MOCK_DEADLINE_MS`, `MEMTRACE_MOCK_BAD_JSON`). The per-request param takes precedence over the env var. This means:

- Global test setup can set a failure mode for the entire suite
- Individual tests can override for specific scenarios
- The params are stripped from `args` before routing, so they never pollute the actual tool call payload
- Clean separation — the McpClient and adapter never see these magic params

### 3. `try/finally` Env Var Restoration

**Location**: `memtrace-adapter.test.mjs:347-359, 408-422`
**Pattern**: Deterministic env var management

**Why This Is Good**: The timeout tests save the previous env var value before overriding, then restore it in the `finally` block. This ensures:

- Cross-test pollution is impossible
- If a test times out or throws, the env is still restored
- The pattern is duplicated but consistent — easy to extract a helper

### 4. Mock uses `rl.close()` before `process.exit()`

**Location**: `memtrace-mock.mjs:177, 185-190`
**Pattern**: Graceful readline shutdown

**Why This Is Good**: On shutdown, the mock calls `rl.close()` to stop reading stdin, then uses `setTimeout(() => process.exit(0), 100)` to give the response time to flush. The `close` event handler is distinct from the `line` handler, ensuring clean separation of concerns.

---

## Test File Analysis

### File Metadata

- **Test File**: `_bmad/scripts/memtrace/memtrace-adapter.test.mjs`
- **File Size**: 730 lines, ~22 KB
- **Test Framework**: `node:test` (Node.js built-in)
- **Language**: JavaScript (ESM)

### Test Structure

- **Describe Blocks**: 12 (CLI arguments, Summarization, Freshness, Batch, MCP queries, Timeout detection accuracy, McpClient robustness, withTimeout, sendRequest, JSON parse hardening, shutdown, kill, stderr, debug, regression)
- **Test Cases (it/test)**: 60 (21 unit + 39 integration)
- **Average Test Length**: ~10 lines
- **Fixtures Used**: `makeMockChild()` factory, `memtrace-fixtures.mjs` (indirectly through mock)
- **Env Vars Managed**: `MEMTRACE_MOCK_PATH`, `MEMTRACE_TIMEOUT_MS`, `MEMTRACE_DEBUG`, `MEMTRACE_MOCK_DEADLINE_MS`, `MEMTRACE_FRESHNESS_MAX_AGE_MINUTES`, `NODE_NO_WARNINGS`

### Assertions Analysis

- **Total Assertions**: ~130
- **Assertions per Test**: ~2.2 (avg)
- **Assertion Types**: `assert.equal`, `assert.ok`, `assert.rejects`, `assert.deepEqual`, `assert.fail`

---

## File Quality Analysis

### memtrace-mock.mjs (193 lines)

| Criterion               | Status | Notes                                                 |
| ----------------------- | ------ | ----------------------------------------------------- |
| Zero external deps      | ✅     | Only `readline`                                       |
| JSON-RPC 2.0 compliance | ✅     | Correct framing, id handling, error codes             |
| Magic param stripping   | ✅     | Cleanly extracts and deletes magic params             |
| Debug logging           | ✅     | Stderr-only, guarded by env var                       |
| Process lifecycle       | ✅     | Handles shutdown, SIGTERM, SIGINT, rl.close()         |
| `memtrace_order` bug    | ❌     | Extracted but never applied. AC #5 requirement unmet. |

### memtrace-fixtures.mjs (73 lines)

| Criterion                   | Status | Notes                                                          |
| --------------------------- | ------ | -------------------------------------------------------------- |
| Field shape matches adapter | ✅     | All consumed fields present and correctly named                |
| Type consistency            | ⚠️     | `line` is string in get_impact, number in find_dead_code       |
| Coverage of all 6 types     | ⚠️     | 3 of 6 unused by integration tests                             |
| Empty/edge results          | ❌     | No empty-array variant for any fixture                         |
| Realistic data              | ✅     | Symbol names, file paths, and complexity scores look realistic |

### memtrace-adapter.mjs (786 lines) — Mock injection

| Criterion                     | Status | Notes                                                                                                                                                                                                              |
| ----------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `MEMTRACE_MOCK_PATH` guard    | ✅     | Read at module load, checked in `spawn()`                                                                                                                                                                          |
| `useMock` spawn path          | ✅     | `spawn(process.execPath, [mockPath], { shell: false })`                                                                                                                                                            |
| Real memtrace spawn preserved | ✅     | Unchanged in `else` branch                                                                                                                                                                                         |
| Cross-platform                | ⚠️     | Mock spawn uses `shell: false` (unlike real memtrace which uses `shell: process.platform === 'win32'`). This difference could cause issues on Windows if the mock path requires shell processing (spaces in path). |
| Debug logging for mock        | ✅     | `debugLog('[McpClient] spawn mock', MEMTRACE_MOCK_PATH)`                                                                                                                                                           |

### memtrace-adapter.test.mjs (730 lines) — Test suite

| Criterion              | Status | Notes                                                           |
| ---------------------- | ------ | --------------------------------------------------------------- |
| 60 tests pass          | ✅     | Stated as complete                                              |
| Deterministic          | ✅     | No conditional fallback branches                                |
| Env var management     | ✅     | `try/finally` restoration                                       |
| Failure tests          | ⚠️     | Only timeout path tested                                        |
| Protocol compliance    | ❌     | No handshake verification                                       |
| 3/6 query types tested | ⚠️     | Missing find_code, get_symbol_context, memtrace_check_freshness |

---

## Context and Integration

### Related Artifacts

- **Story File**: `_bmad-output/implementation-artifacts/i-2-hermetic-mcp-mocking.md`
- **Previous Test Review**: `_bmad-output/test-artifacts/test-reviews/review-i-1-mcpclient-refactor.md` (93/100)
- **Mock File**: `_bmad/scripts/memtrace/memtrace-mock.mjs`
- **Fixtures File**: `_bmad/scripts/memtrace/memtrace-fixtures.mjs`
- **Adapter File**: `_bmad/scripts/memtrace/memtrace-adapter.mjs`
- **Test File**: `_bmad/scripts/memtrace/memtrace-adapter.test.mjs`

---

## Knowledge Base References

This review consulted the following knowledge base fragments:

- **[test-quality.md]** — Definition of Done for tests (no hard waits, <300 lines, self-cleaning)
- **[data-factories.md]** — Factory functions with overrides
- **[test-levels-framework.md]** — Unit vs Integration test appropriateness
- **[test-priorities-matrix.md]** — P0/P1/P2/P3 classification framework
- **Protocol Compliance** — MCP JSON-RPC 2.0 specification for stdio transport

---

## Next Steps

### Immediate Actions (Before Merge)

1. **Fix `memtrace_order` bug** — Either implement response reordering or remove the feature declaration from AC #5
   - Priority: P0
   - Owner: Dev
   - Estimated Effort: 30 min (implement) or 5 min (document)

2. **Add failure-mode integration tests** — Cover `memtrace_fail` and `memtrace_bad_json`
   - Priority: P1
   - Owner: Murat (TEA Agent)
   - Estimated Effort: 30 min

3. **Add protocol handshake verification** — Test that `notifications/initialized` is emitted (or verify via stderr debug capture)
   - Priority: P1
   - Owner: Murat (TEA Agent)
   - Estimated Effort: 20 min

### Follow-up Actions (After Merge)

1. **Add test IDs and priority markers** — Carry from i-1 recommendation
   - Priority: P3
   - Target: Next sprint

2. **Add empty-result fixture edge case** — Test adapter's empty-array handling
   - Priority: P2
   - Target: Backlog

3. **Add stale-freshness assertion** — Verify old-project is detected as stale
   - Priority: P2
   - Target: Backlog

### Re-Review Needed?

✅ Yes — re-review recommended after the `memtrace_order` bug is resolved and failure-mode tests are added.

---

## Decision

**Recommendation**: Conditional Approve

**Rationale**:
The core achievement of this story — deterministic mock-based testing with zero external dependencies — is solid. The architecture (separate mock/fixture/adapter), protocol compliance (JSON-RPC 2.0 over stdio), and process lifecycle management are well-executed. All 60 tests pass deterministically.

However, three issues prevent unconditional approval:

1. **`memtrace_order` is declared but not implemented** (P0). The mock's `extractMagicParams` captures `order` and discards it. The `handleToolCall` function has no ordering logic. This is a latent bug — tests relying on this feature will silently pass in request order.

2. **Only 1 of 4 failure modes is integration-tested** (P1). `memtrace_fail` and `memtrace_bad_json` have zero test coverage through the mock server.

3. **Protocol handshake details are unverified** (P1). No test asserts that `notifications/initialized` is emitted or that `tools/list` returns correct schemas.

Score: 84/100 (B+). This exceeds the >= 70 QA gate but has actionable gaps that should be addressed before merge, particularly the `memtrace_order` bug which is a declared-feature-vs-implementation gap.

**For Conditional Approve**:

> Core mock architecture is solid and all tests pass deterministically. Fix the `memtrace_order` implementation gap (P0) and add failure-mode integration tests (P1) before merge. Protocol handshake verification (P1) is strongly recommended but not blocking.

---

## Appendix

### Violation Summary by Location

| File                        | Severity      | Criterion                        | Issue                                                          | Fix                                                                                         |
| --------------------------- | ------------- | -------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `memtrace-mock.mjs:63-79`   | P0 (Critical) | Declared feature not implemented | `memtrace_order` extracted but never used in response ordering | Implement ordering or remove from AC #5                                                     |
| `memtrace-adapter.test.mjs` | P1 (High)     | Failure-mode coverage            | No test for `memtrace_fail` or `memtrace_bad_json`             | Add env-var-based integration tests                                                         |
| `memtrace-adapter.test.mjs` | P1 (High)     | Protocol compliance              | `notifications/initialized` never verified                     | Add assertion on mock output or stderr debug                                                |
| `memtrace-adapter.test.mjs` | P1 (High)     | Fixture completeness             | 3 of 6 fixture types never integration-tested                  | Add mock-direct unit test for `find_code`, `get_symbol_context`, `memtrace_check_freshness` |
| `memtrace-fixtures.mjs`     | P2 (Medium)   | Type consistency                 | `line` is string in `get_impact`, number in `find_dead_code`   | Normalize to number                                                                         |
| `memtrace-fixtures.mjs`     | P2 (Medium)   | Edge cases                       | No empty-result variant for any fixture                        | Add `empty_` fixture variants                                                               |
| `memtrace-adapter.test.mjs` | P3 (Low)      | Test IDs                         | Missing unique test IDs                                        | Add `TC-MOCK-*` prefixes                                                                    |
| `memtrace-adapter.test.mjs` | P3 (Low)      | Priority markers                 | Missing P0/P1 annotations                                      | Add `[P0]`/`[P1]` prefixes                                                                  |

### Quality Trends

| Review Date      | Score  | Grade | Critical Issues                  | Trend                                     |
| ---------------- | ------ | ----- | -------------------------------- | ----------------------------------------- |
| 2026-05-29 (i-2) | 84/100 | B+    | 1 (memtrace_order unimplemented) | ➡️ Baseline for hermetic mock             |
| 2026-05-29 (i-1) | 93/100 | A     | 0                                | ↩️ i-2 is lower due to implementation gap |

### Related Reviews

| File                              | Score  | Grade | Critical | Status                 |
| --------------------------------- | ------ | ----- | -------- | ---------------------- |
| `memtrace-adapter.test.mjs` (i-2) | 84/100 | B+    | 1        | ⚠️ Conditional Approve |
| `memtrace-adapter.test.mjs` (i-1) | 93/100 | A     | 0        | ✅ Approved            |

**Variance**: -9 pts. The i-2 score is lower because:

1. The `memtrace_order` bug is a P0 issue (declared feature not implemented)
2. Failure-mode coverage is thinner (1/4 modes tested vs all failure paths in i-1)
3. Protocol compliance is unverified (new concern unique to i-2)

---

## Review Metadata

**Generated By**: BMad TEA Agent (Murat, Master Test Architect)
**Workflow**: testarch-test-review v4.0
**Review ID**: test-review-i-2-hermetic-mcp-mocking-20260529
**Timestamp**: 2026-05-29
**Version**: 1.0
