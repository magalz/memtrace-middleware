# Test Design: Story 2.1 — Fusion Engine & Provenance Injection

**Date:** 2026-05-28
**Author:** Magal
**Status:** Draft

---

## Executive Summary

**Scope:** Epic-Level test design for Story 2.1 (Epic 2: Context Fusion & Injection)

**Risk Summary:**

- Total risks identified: 6
- High-priority risks (≥6): 2
- Critical categories: INTEG (fusion integrity), ACC (provenance accuracy)

**Coverage Summary:**

- P0 scenarios: 19 tests (~5-7 hours)
- P1 scenarios: 8 tests (~2-3 hours)
- P2/P3 scenarios: 5 tests (~1-2 hours)
- **Total effort**: 32 tests (~8-12 hours)

---

## Not in Scope

| Item | Reasoning | Mitigation |
| ---- | --------- | ---------- |
| **E2E / Browser tests** | Backend-only TypeScript library — no UI | All coverage at Unit/Contract/Integration levels |
| **Performance benchmarks** | Fusion engine is a pure function (no I/O, no async) — performance is dominated by Memtrace query execution, not fusion | Covered by existing backend timeout/degradation tests |
| **Security-specific tests** | No auth, PII, or injection surfaces in fusion layer | Standard input validation through `validateContext()` covers safety boundary |
| **Cross-repo MemFleet enrichment** | Deferred to Growth phase (FR33-FR35) | Noted in story file — out of MVP scope |

---

## Risk Assessment

### High-Priority Risks (Score ≥6)

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner | Timeline |
| ------- | -------- | ----------- | ----------- | ------ | ----- | ---------- | ----- | -------- |
| R-001 | DATA | **Deduplication failure**: overlapping symbols from parallel queries produce duplicate entries in FusedContext, causing the agent to see repeated/redundant context | 2 | 3 | 6 | Deterministic dedup by `symbol::file_path::start_line` composite key; unit tests with intentional overlap scenarios | DEV | Pre-DS |
| R-002 | ACC | **Provenance fabrications**: schema validation accepts fabricated/non-existent file paths or out-of-bounds line numbers, compromising claim traceability (FR14) | 2 | 3 | 6 | `validateContext()` rejects empty file_path, negative lines, end<start; unit tests covering all negative cases | DEV | Pre-DS |

### Medium-Priority Risks (Score 3-4)

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner |
| ------- | -------- | ----------- | ----------- | ------ | ----- | ---------- | ----- |
| R-003 | INTEG | **Partial result corruption**: a timed-out sub-query's DegradedStub causes the entire fusion result to be dropped or mis-ordered, losing valid data from successful queries | 2 | 2 | 4 | Deterministic merge: degraded results excluded from blocks but set `partial: true`; valid results always preserved; unit tests with mixed degraded/valid inputs | DEV |
| R-004 | TECH | **DI boundary violation**: fusion engine directly imports `src/backend/`, creating circular dependency and breaking test isolation | 1 | 3 | 3 | Contract test verifies no backend import in engine source; barrel export enforces boundary at package level | DEV |

### Low-Priority Risks (Score 1-2)

| Risk ID | Category | Description | Probability | Impact | Score | Action |
| ------- | -------- | ----------- | ----------- | ------ | ----- | ----- |
| R-005 | DATA | **Edge case — all results degraded**: every sub-query times out, producing empty FusedContext but no error, causing silent empty response | 1 | 2 | 2 | Unit test verifies `partial: true` + empty blocks + provenance entries for each degraded tool |
| R-006 | DATA | **Null/primitive data crash**: `QueryResult.data` is a primitive type (string, number, boolean) and the engine throws instead of gracefully skipping | 1 | 2 | 2 | Type narrowing with `unknown` — no `any`; unit tests with null/undefined/primitive data verify graceful skip |

### Risk Category Legend

- **TECH**: Technical/Architecture (flaws, integration, scalability)
- **SEC**: Security (access controls, auth, data exposure)
- **PERF**: Performance (SLA violations, degradation, resource limits)
- **DATA**: Data Integrity (loss, corruption, inconsistency)
- **ACC**: Accuracy / Provenance (claim traceability, correctness)
- **INTEG**: Integration Integrity (partial/corrupted data handling)
- **BUS**: Business Impact (UX harm, logic errors, revenue)
- **OPS**: Operations (deployment, config, monitoring)

---

## NFR Planning

**Purpose:** Capture story-specific NFR thresholds and planned validation for later `nfr-assess`.

| NFR Category | Requirement / Threshold | Risk Link | Planned Validation | Evidence Needed |
| ------------ | ----------------------- | --------- | ------------------ | --------------- |
| Reliability | Partial results never drop valid data — all successful sub-queries produce ContextBlocks regardless of failed siblings | R-003 | Unit tests: degraded + valid mixed inputs; integration: slow-tool scenario | Test report with partial=true coverage |
| Maintainability | No `src/backend/` imports in fusion module — DI boundary enforced by barrel exports and ESLint `import/no-restricted-paths` | R-004 | Contract test: engine source grep for backend imports; ESLint rule confirmation | Contract test pass + ESLint report |
| Data Integrity | All provenance strings match `[memtrace: grounded via ...]` format — zero fabrications accepted | R-002 | Unit tests: provenance format regex; validate tests: reject empty/invalid paths/lines | Test report with 100% validation coverage |

**Unknown thresholds:** None — all story-level NFRs are captured in ACs. System-level NFRs (latency, throughput) depend on Memtrace query execution, not pure fusion function.

---

## Entry Criteria

- [x] Story 2.1 approved with clear acceptance criteria (10 ACs)
- [ ] Test framework configured: vitest in `vitest.config.ts` — ✅ verified
- [ ] Existing test patterns loaded: Given-When-Then, `[P0-P2]` priorities, vitest `describe`/`it`/`expect`
- [ ] Existing fixtures available: `createMockMemtrace`, `buildIntent`, `mockCapabilities`
- [x] Fusion engine files not yet implemented (TDD red phase applies)

## Exit Criteria

- [ ] All P0 tests passing (19 tests)
- [ ] All P1 tests passing (8 tests — failures triaged if needed)
- [ ] No open high-priority risks (R-001, R-002 mitigations verified)
- [ ] Test coverage: 100% AC coverage via traceability matrix
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm build` all pass with zero errors

---

## Test Coverage Plan

### P0 (Critical) — Run on every commit

**Criteria:** Blocks core journey + High risk (≥6) + No workaround

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| ----------- | ---------- | --------- | ---------- | ----- | ----- |
| AC 1 — Dedup overlapping symbols | Unit | R-001 | 1 | DEV | Same symbol across queries → single entry, highest centrality |
| AC 1 — Rank by centrality descending | Unit | R-001 | 1 | DEV | Sort invariant: high-centrality first |
| AC 1 — Return Result<FusedContext> shape | Unit | R-004 | 1 | DEV | `{ok:true,value}` or `{ok:false,error}` discriminated union |
| AC 2 — Provenance annotation on every block | Unit | R-002 | 1 | DEV | `[memtrace: grounded via ...]` per block |
| AC 2 — Provenance exact format | Unit | R-002 | 1 | DEV | Regex match on exact format string |
| AC 4 — Valid context passes validation | Unit | R-002 | 1 | DEV | Identity: validated context === input context |
| AC 4 — Empty file_path rejected | Unit | R-002 | 1 | DEV | `cause: 'fusion_validation_failed'`, `recoverable: false` |
| AC 4 — end_line < start_line rejected | Unit | R-002 | 1 | DEV | Line boundary guard |
| AC 4 — Negative start_line rejected | Unit | R-002 | 1 | DEV | Negative line guard |
| AC 4 — Negative end_line rejected | Unit | R-002 | 1 | DEV | Negative line guard |
| AC 4 — Blank symbol rejected | Unit | R-002 | 1 | DEV | Empty string guard |
| AC 4 — Multiple blocks: first invalid triggers rejection | Unit | R-002 | 1 | DEV | Short-circuit validation |
| AC 4 — MiddlewareError envelope on failure | Unit | R-002 | 1 | DEV | cause/recoverable/tier/trace_id/suggested_action |
| AC 6 — DI compliance (no backend import) | Contract | R-004 | 1 | DEV | Engine source grep for backend imports |
| AC 10 — FusedContext envelope shape | Contract | R-004 | 1 | DEV | blocks/partial/trace_id/provenance keys |
| AC 10 — ContextBlock field types | Contract | R-004 | 1 | DEV | Runtime typeof checks |
| AC 10 — Regression guard snapshot | Contract | R-004 | 1 | DEV | Deterministic output for known inputs |
| AC 10 — Result shape contract | Contract | R-004 | 1 | DEV | `ok:true+value` or `ok:false+error` |
| AC 1,2,3 — Full pipeline produces provenance | Integration | R-001,R-002 | 1 | DEV | classify→plan→execute→fuse → provenance in output |

**Total P0**: 19 tests, ~5-7 hours

### P1 (High) — Run on PR to main

**Criteria:** Important features + Medium risk (3-4) + Common workflows

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| ----------- | ---------- | --------- | ---------- | ----- | ----- |
| AC 5 — Partial results: degraded+valid mixed | Unit | R-003 | 1 | DEV | `partial: true`, valid results preserved |
| AC 5 — Data as array → all items extracted | Unit | R-003 | 1 | DEV | Array normalization |
| AC 5 — Data as single object → one block | Unit | R-003 | 1 | DEV | Object normalization |
| AC 5 — Callers/callees flatten into blocks | Unit | R-003 | 1 | DEV | Nested structure extraction |
| AC 5 — Affected_symbols flatten into blocks | Unit | R-003 | 1 | DEV | Impact result extraction |
| AC 4 — Partial:true passes validation | Unit | R-002 | 1 | DEV | Partial contexts are still valid |
| AC 1,2,6 — Multi-query merged deduplicated | Integration | R-001,R-004 | 1 | DEV | get_symbol_context → merged blocks |
| AC 6 — BaseAdapter imports fuse, no inline assembly | Integration | R-004 | 1 | DEV | Source-level verification |

**Total P1**: 8 tests, ~2-3 hours

### P2 (Medium) — Run nightly/weekly

**Criteria:** Secondary features + Low risk (1-2) + Edge cases

| Requirement | Test Level | Risk Link | Test Count | Owner | Notes |
| ----------- | ---------- | --------- | ---------- | ----- | ----- |
| AC 5 — All results degraded → partial, empty blocks | Unit | R-005 | 1 | DEV | Edge case: 100% degradation |
| AC 5 — Empty results → partial:false, empty blocks | Unit | R-005 | 1 | DEV | Edge case: no input |
| AC 5 — Null/undefined/primitive data skipped | Unit | R-006 | 1 | DEV | Type narrowing edge cases |
| AC 4 — Zero lines (0,0) passes if end>=start | Unit | R-002 | 1 | DEV | Edge case: root-level symbols |
| AC 5 — Partial slow-tool produces partial:true | Integration | R-003 | 1 | DEV | Slow tool in pipeline |

**Total P2**: 5 tests, ~1-2 hours

---

## Execution Strategy

### Smoke Tests (<2 min)

**Purpose:** Fast feedback — catch build-breaking issues

- [ ] All unit engine tests pass (13 tests — ~30s)
- [ ] All unit validate tests pass (10 tests — ~20s)

**Total**: 2 test suites

### P0 Tests (<5 min)

**Purpose:** Critical path validation

- [ ] Fusion engine core: dedup, ranking, provenance (4 tests)
- [ ] Fusion validation: schema validation (7 tests)
- [ ] Contract: envelope shape, types, regression (4 tests)
- [ ] Pipeline: find_code full roundtrip (1 integration test)

**Total**: 16 test scenarios

### P1 Tests (<5 min)

**Purpose:** Important feature coverage

- [ ] Partial results handling (4 unit tests)
- [ ] Multi-query merge (1 integration test)
- [ ] DI boundary verification (1 contract test + 1 integration test)

**Total**: 7 test scenarios

### P2 Tests (<3 min)

**Purpose:** Edge case coverage

- [ ] All-degraded, empty, primitive data edge cases (4 unit tests)
- [ ] Slow-tool pipeline edge case (1 integration test)

**Total**: 5 test scenarios

---

## Resource Estimates

### Test Development Effort

| Priority | Count | Hours/Test | Total Hours | Notes |
| -------- | ----- | ---------- | ----------- | ----- |
| P0 | 19 | — | ~5-7h | Complex logic for dedup/rank/provenance; validation schemas |
| P1 | 8 | — | ~2-3h | Partial results, DI verification |
| P2 | 5 | — | ~1-2h | Edge cases, type narrowing |
| **Total** | **32** | **—** | **~8-12h** | **~1-2 days** |

### Prerequisites

**Test Data:**
- `makeResult()` and `makeSymbol()` factory functions — inline in test files (following existing patterns)
- `buildIntent()` from `tests/helpers/test-utils.ts` — reusable fixture

**Tooling:**
- `vitest` for all test execution — pre-configured in `vitest.config.ts`
- `createMockMemtrace()` from `tests/fixtures/memtrace-mock.ts` for integration tests

**Environment:**
- Node.js >= 20 (project requirement)
- Standard dev environment (no special setup needed for pure function testing)

---

## Quality Gate Criteria

### Pass/Fail Thresholds

- **P0 pass rate**: 100% (no exceptions)
- **P1 pass rate**: ≥95% (waivers required for failures)
- **P2 pass rate**: ≥90% (informational)
- **High-risk mitigations**: 100% complete or approved waivers

### Coverage Targets

- **Critical paths (dedup, rank, provenance)**: ≥80%
- **Validation scenarios**: 100% of AC 4 negative cases
- **Business logic (merge, flatten)**: ≥70%
- **Edge cases (null, empty, all-degraded)**: ≥50%

### Non-Negotiable Requirements

- [ ] All P0 tests pass
- [ ] No high-risk (≥6) items unmitigated (R-001, R-002)
- [ ] Fusion validation (SEC-equivalent) passes 100%
- [ ] DI boundary confirmed — no backend imports in fusion module

---

## Mitigation Plans

### R-001: Deduplication failure (Score: 6)

**Mitigation Strategy:** Use deterministic composite key `symbol::file_path::start_line` for dedup. Unit tests with two overlapping queries verify single entry with highest centrality. Regression guard in contract test ensures stable output for known inputs.

**Owner:** DEV
**Timeline:** Pre-DS (before implementation)
**Status:** Planned
**Verification:** `engine.test.ts` dedup test passes; `engine.pact.test.ts` regression guard passes

### R-002: Provenance fabrications (Score: 6)

**Mitigation Strategy:** `validateContext()` rejects all invalid shapes: empty file_path, blank symbol, negative lines, end<start. 10 unit tests cover every negative case plus happy path. Validation runs before FusedContext reaches the agent.

**Owner:** DEV
**Timeline:** Pre-DS (before implementation)
**Status:** Planned
**Verification:** `validate.test.ts` all 10 tests pass; provenance format test in `engine.test.ts` passes

### R-003: Partial result corruption (Score: 4)

**Mitigation Strategy:** Degraded stubs (.degraded===true) excluded from blocks but set `partial: true`. Valid results always produce blocks. Unit tests with 1 degraded + 2 valid verify preservation.

**Owner:** DEV
**Timeline:** During DS
**Status:** Planned
**Verification:** `engine.test.ts` partial results tests pass

### R-004: DI boundary violation (Score: 3)

**Mitigation Strategy:** Contract test verifies engine source does not contain `src/backend/` or `../backend/` imports. ESLint `import/no-restricted-paths` (if configured) provides static analysis guard.

**Owner:** DEV
**Timeline:** During DS
**Status:** Planned
**Verification:** `engine.pact.test.ts` DI boundary test passes; `pnpm lint` zero errors

### R-005: All results degraded (Score: 2)

**Mitigation Strategy:** Unit test verifies `partial: true`, empty blocks, and provenance strings for each degraded tool. No crash — graceful empty result.

**Owner:** DEV
**Timeline:** During DS
**Status:** Planned
**Verification:** `engine.test.ts` all-degraded test passes

### R-006: Null/primitive data crash (Score: 2)

**Mitigation Strategy:** Type narrowing with `unknown` instead of `any`. Unit tests with null, undefined, string, number, boolean data verify graceful skip with zero blocks.

**Owner:** DEV
**Timeline:** During DS
**Status:** Planned
**Verification:** `engine.test.ts` primitive data test passes

---

## Assumptions and Dependencies

### Assumptions

1. Fusion engine is a pure synchronous function — no I/O, no async, no side effects
2. Centrality scores from Memtrace results are used as-is (best-effort) — defaults to 0 when absent
3. Existing `buildDefaultContext()` provenance format is correct and unchanged
4. `QueryResult` type already validated at transport layer — fusion receives well-typed results

### Dependencies

1. Story 1.4 (BaseAdapter orchestrator) — must provide inline `ContextBlock` assembly code (lines 245-273) to replace
2. `src/types.ts` — must export `FusedInput`, `FusedContext`, `ContextBlock`, `QueryResult`, `Result<T,E>` (verified: already exported, do NOT modify)

### Risks to Plan

- **Risk**: Inline BaseAdapter fusion replacement reveals hidden coupling
  - **Impact**: Integration tests fail; pipeline wiring requires more than a drop-in replacement
  - **Contingency**: Unit tests validate fusion engine independently before BaseAdapter integration; integration tests reveal coupling early

---

## Interworking & Regression

| Service/Component | Impact | Regression Scope |
| ----------------- | ------ | ---------------- |
| **BaseAdapter** (`src/interface/base-adapter.ts`) | Inline ContextBlock assembly (lines 245-273) replaced by `fuse()` call | Existing `base-adapter-orchestration.test.ts` — all 6 tests must still pass |
| **Barrel exports** (`src/index.ts`, `src/fusion/index.ts`) | New fusion symbols exported | Contract tests verify shape; no existing consumers yet |
| **Integration tests** (`transport-roundtrip.test.ts`) | Fusion integration tests added to `fusion-pipeline.test.ts` | All existing integration tests continue unchanged |

---

## Appendix

### Knowledge Base References

- `risk-governance.md` — Risk classification framework
- `probability-impact.md` — Risk scoring methodology (1-3 scale)
- `test-levels-framework.md` — Test level selection (Unit/Contract/Integration for backend)
- `test-priorities-matrix.md` — P0-P3 prioritization rules

### Related Documents

- Story: `_bmad-output/implementation-artifacts/2-1-fusion-engine-and-provenance-injection.md`
- Architecture: `planning-artifacts/architecture.md` (Fusion Engine design, lines 563-565)
- PRD: `planning-artifacts/prd.md` (FR11-FR14)
- ATDD Checklist: `_bmad-output/test-artifacts/atdd/atdd-checklist-2-1-fusion-engine-and-provenance-injection.md`

### Follow-on Workflows (Manual)

- Run `*atdd` to generate failing P0 tests (separate workflow; not auto-run).
- Run `*automate` for broader coverage once implementation exists.

---

**Generated by**: BMad TEA Agent — Test Architect Module
**Workflow**: `bmad-testarch-test-design`
