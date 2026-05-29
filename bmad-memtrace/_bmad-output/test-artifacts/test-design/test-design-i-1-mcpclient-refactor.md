---
workflowStatus: in-progress
totalSteps: 5
stepsCompleted: ['step-01-detect-mode', 'step-02-load-context']
lastStep: 'step-02-load-context'
nextStep: 'step-03-risk-assessment'
lastSaved: '2026-05-29T11:07:30.000Z'
---

# Test Design: Story I.1 — McpClient Refactor — Robustness Hardening

**Date:** 2026-05-29
**Author:** Magal (via Murat, Master Test Architect)
**Status:** Draft

---

## Executive Summary

**Scope:** Story-level test design for Story I.1 (McpClient Refactor)

**Risk Summary:**

- Total risks identified: 6
- High-priority risks (score ≥6): 3
- Critical categories: Resource Leak, Race Condition, Regression

**Coverage Summary:**

- P0 scenarios: 10 (8 hours)
- P1 scenarios: 7 (3.5 hours)
- P2 scenarios: 0
- P3 scenarios: 0
- **Total effort**: 17 tests, ~11.5 hours (~1.5 days)

---

## Not in Scope

| Item | Reasoning | Mitigation |
|------|-----------|------------|
| **E2E integration tests against live MCP server** | This is a pure unit-level refactor; integration tests already exist in the suite (30+ tests) | Existing integration tests serve as regression safety net (AC#7) |
| **Performance/load testing** | Story focuses on correctness and resource cleanup, not throughput | NFR validation deferred to Epic 4 CI/CD gate |
| **Cross-repo contract testing** | McpClient is the sole client and there is no separate MCP server repo under test | Adapter's JSON protocol is validated by unit tests with mocked MCP server |
| **Browser/UI testing** | Purely backend Node.js module | N/A |
| **CI/CD pipeline changes** | No pipeline changes in this story | Existing CI run continues to execute `node --test` |

---

## Risk Assessment

### High-Priority Risks (Score ≥6)

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner | Timeline |
|---------|----------|-------------|-------------|--------|-------|------------|-------|----------|
| R-001 | TECH | **Resource leak from unremoved listeners** — stdout/stderr listeners not cleaned up on shutdown/kill, causing process hang or EventEmitter leak warning | 4 | 3 | 12 | Dedicated test for listener removal (test #7, #10, #11); listener count assertions; mandatory cleanup in both shutdown() and kill() code paths | DEV | Pre-DS |
| R-002 | TECH | **Promise mismatch from out-of-order responses** — response for id=2 resolves promise for id=1, causing silent data corruption in caller | 3 | 4 | 12 | Map-based registry with strict id matching; test with 3 out-of-order responses (test #1); guard for unknown id (test #3) | DEV | Pre-DS |
| R-003 | TECH | **Regression in existing 30+ tests** — internal refactor breaks backward-compatible API surface or changes behavior of existing methods | 3 | 4 | 12 | Run full suite before and after each milestone; all function signatures must remain identical; verify all existing tests pass before shipping (AC#7) | DEV | Continuous |

### Medium-Priority Risks (Score 3-4)

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner |
|---------|----------|-------------|-------------|--------|-------|------------|-------|
| R-004 | TECH | **Timeout fires but stale promise remains in registry** — response arrives after timeout and resolves a dangling promise | 3 | 3 | 9 | On timeout: remove id from registry + destroy stdin (test #5); verify map size after timeout | DEV |
| R-005 | TECH | **Malformed JSON corrupts stream buffer** — partial line at buffer boundary causes subsequent valid responses to be lost | 2 | 3 | 6 | Line-based buffering + try/catch around parse; test with interleaved garbage and valid lines (test #12) | DEV |
| R-006 | TECH | **Debug output leaks sensitive information** — MEMTRACE_DEBUG=1 output includes credentials, tokens, or MCP server internals | 1 | 4 | 4 | Verify debug output format in test (#16); review debug strings for param values | DEV |

### Risk Category Legend

- **TECH**: Technical/Architecture (flaws, integration, scalability)
- **SEC**: Security (access controls, auth, data exposure)
- **PERF**: Performance (SLA violations, degradation, resource limits)
- **DATA**: Data Integrity (loss, corruption, inconsistency)
- **BUS**: Business Impact (UX harm, logic errors, revenue)
- **OPS**: Operations (deployment, config, monitoring)

---

## NFR Planning

| NFR Category | Requirement / Threshold | Risk Link | Planned Validation | Evidence Needed |
|-------------|------------------------|-----------|-------------------|-----------------|
| Reliability | Zero resource leaks after shutdown/kill | R-001 | Unit test: listener count verification after shutdown/kill | Test report showing zero Listener leak warnings |
| Reliability | No promise mismatches under any delivery order | R-002 | Unit test: out-of-order delivery of 3+ responses | Test passes consistently |
| Correctness | Malformed input never corrupts subsequent processing | R-005 | Unit test: garbage line between valid responses | Test passes consistently |
| Security | Debug output contains no credentials | R-006 | Code review + test verifying no param values in debug output | Review sign-off + passing test |
| Maintainability | Zero regression in existing test suite | R-003 | Full node --test run before and after | All 30+ tests pass |

**Unknown thresholds:** N/A (story-level correctness, no performance SLAs)

---

## Entry Criteria

- [ ] Story I.1 approved with all 8 ACs signed off
- [ ] Baseline test run: `node --test _bmad/scripts/memtrace/memtrace-adapter.test.mjs` — record pass/fail count
- [ ] Git branch created from main for story implementation
- [ ] Development environment with Node.js available
- [ ] Understanding of McpClient internals (lines 106-231) and withTimeout (lines 427-435)

## Exit Criteria

- [ ] All 17 new test scenarios pass
- [ ] All 30+ existing tests pass (zero regression)
- [ ] ATDD checklist AC-to-test traceability validated (100% AC coverage)
- [ ] No EventEmitter leak warnings on any code path
- [ ] kill() and shutdown() both idempotent verified
- [ ] All listener cleanup verified on: timeout, shutdown, kill, and normal completion paths
- [ ] MEMTRACE_DEBUG=1 produces structured output, MEMTRACE_DEBUG=0 produces clean stderr

---

## Test Coverage Plan

### P0 (Critical) — Run on every commit

**Criteria**: Blocks core functionality + High risk (≥6) + Mandatory for safety

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
|-------------|-----------|-----------|------------|-------|-------|
| Out-of-order response dispatch | Unit | R-002 | 1 | DEV | Map-based registry with id matching |
| Notifications silently consumed | Unit | R-002 | 1 | DEV | No id + method:"notifications/*" |
| TimeoutError with phase field | Unit | R-001 | 1 | DEV | Tagged errors for diagnostics |
| Timeout removes from registry | Unit | R-004 | 1 | DEV | No stale promise after timeout |
| Shutdown removes listeners | Unit | R-001 | 1 | DEV | stdout/stderr listener cleanup |
| Shutdown on dead child no-op | Unit | R-001 | 1 | DEV | Idempotent shutdown |
| kill() clears timers, rejects promises | Unit | R-001 | 1 | DEV | Full resource cleanup |
| Malformed JSON skipped, next valid resolves | Unit | R-005 | 1 | DEV | Parse error hardening |
| Full existing suite passes | Regression | R-003 | 1 | DEV | Zero regression mandate |
| Unknown response id ignored | Unit | R-002 | 1 | DEV | Guard for untracked ids |

**Total P0**: 10 tests, ~8 hours

### P1 (High) — Run on PR to main

**Criteria**: Important robustness + Medium risk (3-4) + Diagnostic support

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
|-------------|-----------|-----------|------------|-------|-------|
| Spawn timeout cleans up error listener | Unit | R-001 | 1 | DEV | Edge case timeout scenario |
| Shutdown on never-spawned client no-op | Unit | R-001 | 1 | DEV | Graceful no-spawn path |
| kill() twice idempotent | Unit | R-001 | 1 | DEV | Double-call safety |
| Notifications consumed at parser level | Unit | R-002 | 1 | DEV | Duplicate safety |
| stderr logged with [MCP stderr] prefix | Unit | R-006 | 1 | DEV | Operational visibility |
| Debug output emitted with MEMTRACE_DEBUG=1 | Unit | R-006 | 1 | DEV | Diagnostic support |
| No debug output without MEMTRACE_DEBUG=1 | Unit | R-006 | 1 | DEV | Clean output by default |

**Total P1**: 7 tests, ~3.5 hours

---

## Execution Order

### Smoke Tests (<2 min)

**Purpose**: Fast feedback — verify existing suite still passes after refactor

- [ ] Run `node --test _bmad/scripts/memtrace/memtrace-adapter.test.mjs` (30+ existing tests)
- [ ] Baseline recorded before any changes

### P0 Tests (<10 min)

**Purpose**: Critical correctness and safety validation

- [ ] Run full suite including 10 new P0 tests
- [ ] Out-of-order dispatch + notification consumption + unknown id guard
- [ ] Timeout error with phase + registry cleanup
- [ ] Shutdown listener removal + dead-child idempotence
- [ ] kill() resource cleanup + promise rejection
- [ ] JSON parse hardening (garbage line between valid)
- [ ] Full suite regression check

**Total P0**: 10 scenarios

### P1 Tests (<15 min)

**Purpose**: Edge case and diagnostic coverage

- [ ] Spawn timeout listener cleanup
- [ ] Never-spawned shutdown
- [ ] Double kill() idempotence
- [ ] stderr capture format
- [ ] Debug output on/off verification

**Total P1**: 7 scenarios

---

## Resource Estimates

### Test Development Effort

| Priority | Count | Hours/Test | Total Hours | Notes |
|----------|-------|-----------|-------------|-------|
| P0 | 10 | 0.8 | 8.0 | Mock setup, registry pattern |
| P1 | 7 | 0.5 | 3.5 | Simple edge cases |
| **Total** | **17** | **-** | **11.5** | **~1.5 days** |

### Prerequisites

**Test Data:**
- Mock ChildProcess factory (stdin Writable stub, stdout/stderr Readable, controlled exit event)
- Controlled Promise/Promise.race helpers (deterministic timeout testing)

**Tooling:**
- Node.js built-in `node:test` and `node:assert/strict` (already configured)
- No additional tools required

**Environment:**
- Node.js runtime (any recent LTS)
- No external services required

---

## Quality Gate Criteria

### Pass/Fail Thresholds

- **P0 pass rate**: 100% (no exceptions)
- **P1 pass rate**: ≥95% (waivers required for failures)
- **P2/P3 pass rate**: N/A
- **High-risk mitigations**: 100% complete (all R-001, R-002, R-003 mitigations in place)

### Coverage Targets

- **Critical paths (listener cleanup, promise dispatch)**: 100%
- **Edge cases (idempotence, malformed input)**: 100%
- **Regression safety (existing tests)**: 100%

### Non-Negotiable Requirements

- [ ] All existing 30+ tests pass (AC#7)
- [ ] No listener leaks on any code path
- [ ] No promise mismatches under out-of-order delivery
- [ ] JSON parse failures never corrupt subsequent processing
- [ ] kill() and shutdown() fully idempotent
- [ ] All 8 ACs have at least one passing test

---

## Mitigation Plans

### R-001: Resource leak from unremoved listeners (Score: 12)

**Mitigation Strategy:** Every code path that terminates a child process (shutdown, kill, timeout in spawn) must explicitly remove stdout and stderr listeners before resolving. Unit tests assert listener count before and after.
**Owner:** DEV
**Timeline:** Pre-DS
**Status:** Planned
**Verification:** Listener count assertions in tests #7, #10, #11

### R-002: Promise mismatch from out-of-order responses (Score: 12)

**Mitigation Strategy:** Replace per-request listener pattern with Map-based registry keyed by request id. Stream listener parses id and dispatches to correct promise. Unknown ids are silently ignored.
**Owner:** DEV
**Timeline:** Pre-DS
**Status:** Planned
**Verification:** Out-of-order delivery test (#1) with 3 responses in id=2, id=1, id=3 order

### R-003: Regression in existing 30+ tests (Score: 12)

**Mitigation Strategy:** Run full suite before starting, after each AC implementation, and as final gate. No API signature changes permitted.
**Owner:** DEV
**Timeline:** Continuous
**Status:** Planned
**Verification:** Full suite pass before and after

---

## Assumptions and Dependencies

### Assumptions

1. The existing test file uses `node:test` with `execFile` integration tests — no changes to this pattern
2. All McpClient public API signatures remain unchanged (constructor, spawn, handshake, sendRequest, callTool, shutdown, kill)
3. Node.js built-ins only — zero external dependencies
4. Cross-platform behavior (Windows SIGTERM, stdin patterns) are preserved

### Dependencies

1. Baseline test run recorded before changes — Required before DS
2. Understanding of McpClient lines 106-231 and withTimeout lines 427-435

---

## Follow-on Workflows

- Run `bmad-testarch-atdd` for P0 test scaffold generation (already completed)
- Run `bmad-testarch-automate` for broader coverage once implementation exists
- Run `bmad-testarch-trace` after implementation for AC-to-test traceability matrix

---

## Approval

**Test Design Approved By:**

- [ ] Product Manager: (pending)
- [ ] Tech Lead: (pending)
- [ ] QA Lead: Murat (Master Test Architect)

**Comments:**

---

## Interworking & Regression

| Service/Component | Impact | Regression Scope |
|-------------------|--------|-----------------|
| **McpClient (memtrace-adapter.mjs)** | Internal refactor of all 5 methods + withTimeout | All 30+ existing tests must pass (AC#7) |
| **runFreshnessCheck()** (line 444) | Caller of McpClient; must see no API change | Existing freshness integration tests |
| **runSingleQuery()** (line 466) | Caller of McpClient; must see no API change | Existing query integration tests |
| **runBatchQuery()** (line 513) | Caller of McpClient; must see no API change | Existing batch mode integration tests |
| **main()** (line 593) | User of McpClient diagnostic; must see no API change | CLI argument handling tests |

---

## Appendix

### Knowledge Base References

- `test-levels-framework.md` — Test level selection (unit-level determination)
- `test-priorities-matrix.md` — P0-P3 prioritization applied

### Related Documents

- Story: `_bmad-output/implementation-artifacts/i-1-mcpclient-refactor.md`
- Source: `_bmad/scripts/memtrace/memtrace-adapter.mjs`
- Existing Tests: `_bmad/scripts/memtrace/memtrace-adapter.test.mjs`
- ATDD Checklist: `_bmad-output/test-artifacts/atdd/atdd-checklist-i-1-mcpclient-refactor.md`

---

**Generated by**: BMad TEA Agent (Murat)
**Workflow**: `bmad-testarch-test-design`
**Version**: 4.0 (BMad v6)
