---
workflowStatus: 'complete'
totalSteps: 5
stepsCompleted:
  [
    'step-01-detect-mode',
    'step-02-risk-assessment',
    'step-03-coverage-plan',
    'step-04-execution-strategy',
    'step-05-handoff',
  ]
lastStep: 'step-05-handoff'
nextStep: ''
lastSaved: '2026-06-01'
workflowType: 'testarch-test-design'
inputDocuments:
  - '_bmad-output/implementation-artifacts/i-3-qa-memtrace-fixes.md'
  - '_bmad/scripts/memtrace/qa-memtrace.mjs'
  - '_bmad/scripts/memtrace/qa-memtrace.test.mjs'
  - '_bmad-output/test-artifacts/atdd/atdd-checklist-i-3-qa-memtrace-fixes.md'
---

# Test Design for QA: QA Memtrace Fixes (Story I.3)

**Purpose:** Test execution recipe for verifying three isolated bug fixes in `qa-memtrace.mjs` with zero regression against 10 existing tests.

**Date:** 2026-06-01
**Author:** Murat (Test Architect)
**Status:** Draft
**Project:** bmad-memtrace

---

## Executive Summary

**Scope:** Unit-level verification of three bug fixes in `_bmad/scripts/memtrace/qa-memtrace.mjs` — TOCTOU race elimination, `cov` variable consistency on line 99, and `total_count` cross-validation with output field. Includes regression validation of all 10 existing tests. The entire test surface is hermetic (temp files, no network, no external deps).

**Risk Summary:**

- Total Risks: 6 (2 high-priority, 2 medium, 2 low)
- Critical Categories: TOCTOU race (data integrity), silent regression (undetected breakage), output contract breakage

**Coverage Summary:**

- P0 tests: ~2 (TOCTOU fix, output contract)
- P1 tests: ~2 (total_count cross-validation, total_count output field)
- P2 tests: ~1 (cov consistency — regression)
- P3 tests: ~1 (elapsed_ms accuracy)
- **Total**: ~13 tests (10 existing + 3 new) — ~0.5 hours with 1 DEV

---

## Not in Scope

| Item                                       | Reasoning                                                                 | Mitigation                                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Full integration/E2E tests**             | Story is about isolated fixes in a single function file                   | The existing script-level tests (`runScript` via `execFileSync`) already serve as integration tests |
| **Performance/load testing**               | Fixes have negligible perf impact (one try/catch, one integer comparison) | Blast radius is small (<1000 symbols), try/catch overhead is sub-ms                                 |
| **Cross-platform testing**                 | Node.js built-ins are cross-platform                                      | CI runs on same platform as dev; `fs` behavior is identical across OS                               |
| **Non-ENOENT error paths in readJsonFile** | Parse errors, permission errors are unchanged behavior                    | Existing error handling is preserved — non-ENOENT errors re-throw original message                  |

---

## Dependencies & Test Blockers

None. All dependencies are Node.js built-ins (`fs`, `fs/promises`, `path`). Test infrastructure is hermetic and self-contained. No external services, APIs, or databases.

**Potential testability concern:**

- `readJsonFile` is not exported from the module. The TOCTOU test needs either:
  1. An `export { readJsonFile }` addition (clean, additive)
  2. Indirect testing via `--blast-radius` pointing to a non-existent file (pragmatic, tests the public CLI surface)

  **Recommendation:** Add `export { readJsonFile }` — it's a single line, zero risk, and enables precise unit testing.

---

## Risk Assessment

### High-Priority Risks (Score ≥6)

| Risk ID          | Category       | Description                                                                                                                                                  | Score | QA Test Coverage                                                                                               |
| ---------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- | -------------------------------------------------------------------------------------------------------------- |
| **R-TOCTOU**     | Data Integrity | `existsSync` + `readFile` window: file deleted between check and read causes uncaught `ENOENT` with cryptic system error instead of clean `"File not found"` | **9** | Direct unit test for `readJsonFile` with missing file; verify clean error message                              |
| **R-REGRESSION** | Regression     | Fix for one bug accidentally breaks existing behavior (e.g., `total_count` validation changes exit code, or cov fix changes coverage calculation)            | **8** | Full regression run of all 10 existing tests before and after each fix; `git diff` review of output JSON shape |

### Medium-Priority Risks (Score 3-5)

| Risk ID        | Category | Description                                                                                                                                 | Score | QA Test Coverage                                                                                        |
| -------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------- |
| **R-OUTPUT**   | Contract | New `total_count_reported` field name conflicts with existing JSON consumer assumptions (strict schema validation)                          | **5** | Verify output JSON has exactly expected fields (additive only); check existing tests parse successfully |
| **R-MISMATCH** | Logic    | `total_count` mismatch warning risks false positives if `total_count` is validated elsewhere and can diverge from `affected_symbols.length` | **4** | Verify with matching (should be silent) and mismatching (should warn) fixtures                          |

### Low-Priority Risks (Score 1-2)

| Risk ID       | Category        | Description                                                                                           | Score | QA Test Coverage                                                                     |
| ------------- | --------------- | ----------------------------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------ |
| **R-IMPORT**  | Maintainability | `existsSync` import removal may cause issues if other code in the same file uses it (it doesn't)      | **1** | Visual inspection of import statement; compile-time error if any usage remains       |
| **R-ELAPSED** | Accuracy        | Adding try/catch or cross-validation could slightly affect `elapsed_ms` field due to extra operations | **2** | Verify `elapsed_ms` is present and reasonable (non-negative, non-zero for real data) |

---

## NFR Test Coverage Plan

| NFR Category    | Requirement / Threshold            | Planned Validation                                     | Tool / Level    | Evidence Artifact    | Priority |
| --------------- | ---------------------------------- | ------------------------------------------------------ | --------------- | -------------------- | -------- |
| Reliability     | Zero TOCTOU race windows           | Remove `existsSync`; verify try/catch catches ENOENT   | Unit test       | TOCTOU test pass     | P0       |
| Maintainability | No dead code / unused imports      | Remove `existsSync` import; no unused fields in output | Static analysis | Import check in test | P2       |
| Accuracy        | `elapsed_ms` within 5% of expected | Verify `elapsed_ms` is present and non-negative        | Unit test       | Output field check   | P3       |

---

## Entry Criteria

- [ ] Story file approved and marked `ready-for-dev`
- [ ] Source code at `_bmad/scripts/memtrace/qa-memtrace.mjs` accessible
- [ ] Existing test suite at `qa-memtrace.test.mjs` passing (baseline run)
- [ ] Node.js 18+ available (supports `node --test`)

## Exit Criteria

- [ ] All 10 existing tests pass with zero regressions
- [ ] New TOCTOU test passes (readJsonFile with missing file → clean "File not found" error)
- [ ] New total_count tests pass (mismatch warns, output includes field)
- [ ] Output JSON contract verified (only additive change: `total_count_reported`)
- [ ] No new dependencies introduced
- [ ] `existsSync` import removed

---

## Test Coverage Plan

### P0 (Critical)

**Criteria:** Blocks core functionality + High risk (≥6) + Must validate before release

| Test ID    | Requirement                                                                     | Test Level | Risk Link    | Notes                                                                                              |
| ---------- | ------------------------------------------------------------------------------- | ---------- | ------------ | -------------------------------------------------------------------------------------------------- |
| **P0-001** | TOCTOU race eliminated — readJsonFile with missing file throws "File not found" | Unit       | R-TOCTOU     | Direct function call (if exported) or CLI with non-existent path                                   |
| **P0-002** | All 10 existing tests pass identically after fixes                              | Regression | R-REGRESSION | Run `node --test _bmad/scripts/memtrace/qa-memtrace.test.mjs`; compare output values with baseline |

**Total P0:** ~2 tests

### P1 (High)

**Criteria:** Important features + Medium risk + Must validate

| Test ID    | Requirement                                       | Test Level | Risk Link  | Notes                                        |
| ---------- | ------------------------------------------------- | ---------- | ---------- | -------------------------------------------- |
| **P1-001** | total_count mismatch emits console.error warning  | Unit       | R-MISMATCH | Fixture with `total_count: 99` but 1 symbol  |
| **P1-002** | Output JSON includes `total_count_reported` field | Unit       | R-OUTPUT   | Verify field value matches input total_count |

**Total P1:** ~2 tests

### P2 (Medium)

**Criteria:** Edge cases + Regression prevention + Low risk

| Test ID    | Requirement                                             | Test Level | Risk Link    | Notes                                                                   |
| ---------- | ------------------------------------------------------- | ---------- | ------------ | ----------------------------------------------------------------------- |
| **P2-001** | cov variable on line 99 produces same results as before | Regression | R-REGRESSION | Existing partial-coverage test (test #7) with identical expected values |
| **P2-002** | `existsSync` import removed without breaking build      | Static     | R-IMPORT     | Visual inspection / compile check                                       |
| **P2-003** | total_count matches actual — no false warning           | Unit       | R-MISMATCH   | Happy path with makeBr() (always produces matching values)              |

**Total P2:** ~3 tests

### P3 (Low)

**Criteria:** Nice-to-have + Exploratory

| Test ID    | Requirement                                                                  | Test Level | Notes                            |
| ---------- | ---------------------------------------------------------------------------- | ---------- | -------------------------------- |
| **P3-001** | elapsed_ms is present and non-negative in output                             | Unit       | Verify after total_count changes |
| **P3-002** | TOCTOU test covers both "never existed" and "deleted after existsSync" paths | Unit       | Two variants of the same test    |

**Total P3:** ~2 tests

---

## Execution Strategy

**Philosophy:** All tests run locally via `node --test`. No CI infrastructure needed. Run in PR for immediate feedback.

### Single Command — Full Suite

```bash
node --test _bmad/scripts/memtrace/qa-memtrace.test.mjs
```

This runs all 10 existing tests. After fixes, same command confirms zero regression.

### New Test Execution

```bash
# TOCTOU test (after exporting readJsonFile or testing via CLI)
node _bmad-output/test-artifacts/atdd/scaffolds/readJsonFile-toctou.test.mjs

# total_count mismatch tests
node _bmad-output/test-artifacts/atdd/scaffolds/total_count-mismatch.test.mjs
```

### Combined

```bash
node --test _bmad/scripts/memtrace/qa-memtrace.test.mjs _bmad-output/test-artifacts/atdd/scaffolds/*.test.mjs
```

---

## QA Effort Estimate

| Priority  | Count  | Effort         | Notes                         |
| --------- | ------ | -------------- | ----------------------------- |
| P0        | 2      | ~0.1 hours     | Regression run + TOCTOU test  |
| P1        | 2      | ~0.1 hours     | Total_count validation        |
| P2        | 3      | ~0.1 hours     | Cov regression, import check  |
| P3        | 2      | ~0.1 hours     | Elapsed_ms, test variants     |
| **Total** | **13** | **~0.5 hours** | **DEV implements + verifies** |

**Note:** No dedicated QA engineer needed. DEV implements fixes and runs tests. TEA reviews in QA-Verify phase.

---

## Implementation Planning Handoff

| Work Item                                          | Owner       | Dependencies/Notes                                     |
| -------------------------------------------------- | ----------- | ------------------------------------------------------ |
| Fix TOCTOU race in `readJsonFile()` (Task 1)       | DEV         | Lines 58-64: remove existsSync, add try/catch          |
| Fix cov variable inconsistency line 99 (Task 2)    | DEV         | Line 99: `mod.coverage` → `cov`                        |
| Add total_count cross-validation + output (Task 3) | DEV         | `compute()`: 2-line change in body + 1 field in return |
| Verify regression — run all 10 existing tests      | DEV         | Must pass before marking tasks complete                |
| **QA-Verify** (post-DS)                            | Murat (TEA) | Test Review + Traceability + Automation                |

---

## Interworking & Regression

| Service/Component      | Impact                                           | Regression Scope                    | Validation Steps                                       |
| ---------------------- | ------------------------------------------------ | ----------------------------------- | ------------------------------------------------------ |
| `qa-memtrace.mjs`      | 3 internal logic changes, no API surface change  | All 10 existing tests               | Run full test suite — compare exact output values      |
| `qa-memtrace.test.mjs` | 10 existing tests must be untouched              | No changes to existing test file    | `git diff` shows no changes to existing tests          |
| CI QA Gate Report      | New `total_count_reported` field emitted in JSON | Downstream consumers of output JSON | Verify consumers ignore unknown fields (per JSON spec) |

**Regression test strategy:**

1. Run baseline: `node --test _bmad/scripts/memtrace/qa-memtrace.test.mjs` — capture output
2. Apply fix
3. Run same command — compare output values (must match exactly)
4. Run new scaffold tests — verify green

---

## Appendix A: AC-to-Test Traceability Matrix

| AC #  | Description                     | Coverage                       | Test(s)                                                   |
| ----- | ------------------------------- | ------------------------------ | --------------------------------------------------------- |
| AC #1 | TOCTOU eliminated               | TOCTOU scaffold                | `readJsonFile` with missing file → "File not found"       |
| AC #2 | cov variable line 99 consistent | Existing test #7               | "partial coverage handling" (identical results)           |
| AC #3 | total_count cross-validation    | Mismatch scaffold              | `total_count: 99` × 1 symbol → console.error warning      |
| AC #4 | Zero regression (10 tests pass) | Full suite run                 | `node --test _bmad/scripts/memtrace/qa-memtrace.test.mjs` |
| AC #5 | New TOCTOU unit test            | TOCTOU scaffold                | Same as AC #1 — new dedicated test                        |
| AC #6 | total_count_reported in output  | Mismatch scaffold + happy path | Output JSON includes field; value matches input           |

---

## Appendix B: Output JSON Contract

**Before fix:**

```json
{
  "status": "pass",
  "blast_radius_total": 2,
  "covered_nodes": 2,
  "uncovered_nodes": 0,
  "coverage_percentage": 100,
  "threshold": 100,
  "passed": true,
  "uncovered_details": [],
  "elapsed_ms": 42
}
```

**After fix (additive change only):**

```json
{
  "status": "pass",
  "blast_radius_total": 2,
  "covered_nodes": 2,
  "uncovered_nodes": 0,
  "coverage_percentage": 100,
  "threshold": 100,
  "passed": true,
  "uncovered_details": [],
  "elapsed_ms": 42,
  "total_count_reported": 2
}
```

**Key validation:** `total_count_reported` is always present in output, including empty blast radius case (where `blast_radius_total` is 0).

---

## Appendix C: Knowledge Base References

- **test-quality.md** — Definition of Done: deterministic, isolated, no shared state
- **test-levels-framework.md** — Unit level for function tests, CLI level for integration
- **ci-burn-in.md** — Regression-first strategy: verify old tests before trusting new ones
- **test-priorities-matrix.md** — P0-P3 criteria used above

---

**Generated by BMad TEA Agent (Murat)** — 2026-06-01
