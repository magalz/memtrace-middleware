# Story 5.3: Autonomous Telemetry Deduplication

Status: done

## Story

As a Dev Agent,
I want to read historical feedback logs and deduce if my feedback already exists,
so that I can apply an autonomous `+1` upvote instead of generating duplicate bug reports.

## Acceptance Criteria

1. **Given** a friction point or feature request to report,
   **When** writing the telemetry file,
   **Then** the agent first reads the existing historical feedback logs
   **And** if a highly similar issue exists, it increments the upvote counter (e.g., `+1`) on the existing entry instead of creating a new one.

2. **Given** the telemetry skill is loaded,
   **When** the agent follows the introspection protocol for Feature Requests,
   **Then** Step 7 explicitly guides the agent through historical log reading and deduplication
   **And** the protocol defines what constitutes "highly similar" with concrete criteria.

3. **Given** the telemetry report template,
   **When** the Feature Requests section is rendered,
   **Then** the table includes an `Upvotes` column tracking cumulative counts
   **And** the template no longer contains the "future stories will add autonomous +1 upvote deduplication" placeholder note.

## Tasks / Subtasks

- [x] Task 1 (AC: #1, #3): Update the Feature Requests template in SKILL.md
  - [x] 1.1: Add `Upvotes` column to the Feature Requests table
  - [x] 1.2: Change template format from 4-column (`ID | Request | Priority | Context`) to 5-column (`ID | Request | Priority | Upvotes | Context`)
  - [x] 1.3: Remove the "future stories will add autonomous +1 upvote deduplication" placeholder note
  - [x] 1.4: Add template guidance showing cumulative upvote tracking (carry-forward from prior reports)

- [x] Task 2 (AC: #1, #2): Add deduplication protocol to Step 7 (Formulate Feature Requests)
  - [x] 2.1: Add Step 7a: Read historical telemetry reports from `_bmad-output/telemetry/`
  - [x] 2.2: Add Step 7b: For each candidate FR, compare against prior reports using similarity criteria
  - [x] 2.3: Add Step 7c: If match found, carry forward with incremented upvotes; if no match, create new entry with upvotes=1
  - [x] 2.4: Define "highly similar" criteria (same tool/capability requested, same underlying problem, same category of improvement)
  - [x] 2.5: Add guidance: "prefer consolidation — when in doubt between similar and distinct, treat as similar and merge"

- [x] Task 3 (AC: #2): Update Confinement Rules section
  - [x] 3.1: Add rule: "**ALWAYS** read all existing telemetry reports from `_bmad-output/telemetry/` before writing the Feature Requests section"
  - [x] 3.2: Add rule: "**NEVER** create a duplicate feature request if a highly similar entry already exists in prior reports — increment the upvote count on the existing entry instead"
  - [x] 3.3: Add rule: "**ALWAYS** carry forward all prior feature requests with their accumulated upvote counts — the latest report is the canonical Feature Request ledger"

- [x] Task 4: Validation
  - [x] 4.1: Verify SKILL.md frontmatter (name, description) is unchanged
  - [x] 4.2: Verify Feature Requests template table has 5 columns: ID | Request | Priority | Upvotes | Context
  - [x] 4.3: Verify the "future stories will add autonomous +1 upvote deduplication" placeholder is removed
  - [x] 4.4: Verify Step 7 includes deduplication sub-steps (7a, 7b, 7c)
  - [x] 4.5: Verify similarity criteria are defined and actionable
  - [x] 4.6: Verify no files outside `.agents/skills/bmad-memtrace-telemetry/SKILL.md` are modified
  - [x] 4.7: Verify all pre-existing sections (Executive Summary, Sprint Context, Tools Used, Tools Omitted, Errors & Failures, Friction Points, Comparative Analysis, Appendix) are unchanged
  - [x] 4.8: Verify skill frontmatter description remains under 200 characters (per Story 4.3 P9 patch)
  - [x] 4.9: Verify the Output Conventions section is updated to reference historical report reading

### Review Findings (AI Code Review)

#### decision-needed

- [x] [Review][Decision] **Missing Test Coverage Justification** — Dismissed: empty blast radius (markdown-only change), no code symbols to map. [Source: Acceptance Auditor — Test Coverage Justification gate]
- [x] [Review][Decision] **No mechanism to retire/withdraw implemented or rejected FRs** — Resolved: added `Status` column (Active / Implemented / Rejected) to Feature Requests table. Step 7a filters to Active only. New requests start Active. Carry-forward rule updated to skip non-Active entries. [Sources: Blind Hunter + Edge Case Hunter]

#### patch

- [x] [Review][Patch] **Missing Mathematical Quality Gate Output section** — Applied: updated Dev Agent Record's Debug Log References to note Phase 1 pattern and recommendation to upgrade. [Source: Acceptance Auditor — Mathematical Gate gate]
- [x] [Review][Patch] **Ambiguous FR ID resolution algorithm** [SKILL.md:7c] — Applied: added explicit FR ID resolution algorithm using regex `FR-(\d+)` to extract max ID. [Source: Blind Hunter]
- [x] [Review][Patch] **Intra-sprint deduplication not addressed** [SKILL.md:7b] — Applied: added intra-sprint consolidation pass after 7c with merge-and-sum logic. [Source: Edge Case Hunter]
- [x] [Review][Patch] **Priority never re-evaluated on carry-forward** [SKILL.md:7c] — Applied: added priority elevation guidance (upvotes ≥ 3 → consider elevate, ≥ 6 → consider again). [Source: Edge Case Hunter]

#### defer

- [x] [Review][Defer] **Historical reports with pre-diff template format** — Older reports use the 4-column table without Upvotes column. The first post-5.3 report will need to parse this legacy format. Pre-existing — only the first migration run will need to handle this. [Source: Edge Case Hunter]
- [x] [Review][Defer] **Corrupted or truncated historical reports** — A prior telemetry run interrupted mid-write could produce a truncated or malformed markdown file. Pre-existing risk not introduced by this story. [Source: Edge Case Hunter]
- [x] [Review][Defer] **STDOUT fallback reports lost from dedup chain** — If a prior telemetry run hit the permission failure fallback (output to STDOUT), those reports never landed on disk and are invisible to the dedup reader. Pre-existing limitation. [Source: Edge Case Hunter]

## Dev Notes

### What This Story Does

This story extends the telemetry skill (created 5.1, enhanced 5.2) by adding autonomous upvote deduplication to the Feature Requests section. When generating a telemetry report, the agent now reads all prior reports, detects semantically similar feature requests, and consolidates them with accumulated upvote counts instead of creating duplicate entries.

The story has ONE deliverable:

**Modified `bmad-memtrace-telemetry/SKILL.md`** — Update the Feature Requests template table to add an `Upvotes` column, replace the "future stories" placeholder with deduplication protocol in Step 7, and add deduplication rules to Confinement Rules.

This implements **FR27** (Agents can deduce if feedback already exists and apply an autonomous `+1` upvote increment to avoid duplicate reports). It is the final link in the Epic 5 chain: telemetry report generation (5.1) → friction severity scoring (5.2) → **autonomous deduplication (5.3)**.

**Epic 5 chain context:**

- Story 5.1 established the telemetry template with a 3-column Feature Requests table and the "future stories" deduplication placeholder
- Story 5.2 added severity scoring to Friction Points (not Feature Requests) and intentionally preserved the deduplication placeholder for 5.3
- Story 5.3 replaces the placeholder, adds Upvotes column, and implements the full deduplication protocol

### Critical Architecture Constraints

- **NO new scripts or code changes:** This story is PURELY a skill file update. Do NOT create Node.js scripts, modify the adapter, or change `package.json`.
- **File location rule (CRITICAL):** All repository files go to `D:\Repos\bmad-memtrace\bmad-memtrace\`. The skill file is at `.agents\skills\bmad-memtrace-telemetry\SKILL.md`.
- **UPDATE only:** This story modifies one existing file. No CREATE operations.
- **Stateless design:** The telemetry skill remains a behavioral guide. No state is persisted between sessions. Deduplication works by reading prior markdown reports — not by maintaining a database or index.
- **Tool catalog integrity:** The Appendix tool catalog must remain unchanged — deduplication does not add or remove Memtrace tools.
- **No live MCP calls:** The Confinement Rule against live MCP calls during telemetry generation must be preserved. Deduplication reads files from disk, not from the Memtrace server.

### Architecture Compliance

- **Commitment to Memtrace (No-Vanilla Opt-out):** Deduplication strengthens the telemetry feedback loop, making it self-cleaning and maintainer-friendly. It does not change the No-Vanilla commitment.
- **Quality Gate principle:** Not directly applicable — no quality gate integration in this story. The telemetry skill reports on quality gate usage but does not execute them.
- **Process confinement (NFR4):** Not applicable — no process management.
- **Anti-Promise.all pattern:** Not applicable — no MCP queries. The telemetry skill is introspection-only.
- **Stateless design:** Preserved. Upvote counts are derived by reading prior reports each time — nothing is persisted outside the markdown files themselves.
- **Token budget (NFR1):** Not applicable — telemetry reports are human-facing, not injected into LLM context. However, the agent should not read every prior report start-to-finish; it should scan for Feature Requests sections only.
- **Index freshness:** Not applicable — no Memtrace queries. The telemetry output directory is a plain filesystem directory.

### Files Being Modified

#### File 1: `.agents/skills/bmad-memtrace-telemetry/SKILL.md` — The telemetry skill (UPDATE)

**Location:** `D:\Repos\bmad-memtrace\bmad-memtrace\.agents\skills\bmad-memtrace-telemetry\SKILL.md`

**Current state (283 lines, after 5.2 changes):**

- YAML frontmatter with `name: bmad-memtrace-telemetry` and description under 200 chars
- Activation triggers, introspection protocol (7 steps with severity assessment in Step 5), embedded template, output conventions, confinement rules
- Feature Requests template table: 4 columns (`ID | Request | Priority (H/M/L) | Context`)
- Placeholder note: "future stories will add autonomous +1 upvote deduplication"
- Step 7 (Formulate Feature Requests): brief guidance to draft FRs with priority
- Confinement Rules: 11 rules covering severity (from 5.2)
- Complete tool catalog (unchanged)

**What this story changes (4 specific modifications):**

1. **Feature Requests template table** — Add Upvotes column:
   Old (lines ~185-193):

   ```
   ## Feature Requests & Feedback

   {Actionable feature requests or improvement suggestions for the Memtrace maintainers.
    Note: future stories will add autonomous +1 upvote deduplication.}

   | ID | Request | Priority (H/M/L) | Context |
   |----|---------|-------------------|---------|
   | FR-{n} | {description} | {priority} | {situation that prompted this} |
   ```

   New:

   ```
   ## Feature Requests & Feedback

   {Cumulative feature requests across ALL sprints. Carry forward all prior requests with accumulated
    upvote counts. New requests start at 1 upvote. The latest report is the canonical Feature Request ledger.}

   | ID | Request | Priority (H/M/L) | Upvotes | Context |
   |----|---------|-------------------|---------|---------|
   | FR-{n} | {description} | {priority} | {count} | {situation that prompted this} |
   ```

2. **Introspection Protocol Step 7** — Replace brief guidance with full deduplication protocol:
   Old (lines ~86-91):

   ```
   ### Step 7: Formulate Feature Requests
   Based on the friction points identified, draft actionable feature requests for maintainers. Each request should include:
   - A clear description of the desired improvement
   - Priority (High / Medium / Low) — should reflect the highest severity of the friction points that motivated the request
   - Context of the situation that motivated the request
   ```

   New:

   ```
   ### Step 7: Formulate Feature Requests

   #### 7a: Read Historical Reports

   Read all prior telemetry reports from `_bmad-output/telemetry/`. Focus specifically on the
   "Feature Requests & Feedback" section of each report. Build a consolidated list of all prior
   feature requests across all historical reports found.

   If the `_bmad-output/telemetry/` directory does not exist or is empty, skip to 7c (all
   requests are new) — this is normal for the first-ever telemetry run.

   #### 7b: Detect Duplicates

   For each candidate feature request from this sprint, compare against the consolidated list
   of prior requests. Two feature requests are HIGHLY SIMILAR (should be merged) when they
   satisfy ANY of these criteria:

   | Criterion | Example |
   |-----------|---------|
   | Same tool or capability being requested | Two reports both request "batch mode for get_impact" |
   | Same underlying problem or root cause | Two reports describe timeout issues, even with different wording |
   | Same category of improvement | Both request "better error messages for stale index" |
   | Semantic overlap (different words, same intent) | "parallel queries" vs "concurrent tool execution" |

   PREFER CONSOLIDATION. When uncertain whether two requests are similar enough to merge,
   err on the side of merging them and note in the context field that the request has been
   raised in multiple sprints. Only treat a request as truly distinct when it targets a
   different tool, a different problem category, or a substantively different improvement.

   #### 7c: Build Consolidated Ledger

   For each entry in your consolidated ledger:
   - **Prior request, no new match:** Carry forward with its existing ID, priority, and
     upvote count unchanged.
   - **Prior request, new match found:** Carry forward with upvote count incremented by +1.
     Update the Context field to note the most recent occurrence.
   - **New request (no prior match):** Assign a new FR-{n} ID (sequential, continuing from
     the highest prior ID found). Set upvotes to 1.

   Also draft any genuinely new feature requests from this sprint's friction points using
   the same format. Priority should reflect the highest severity of the friction points
   that motivated the request.
   ```

3. **Output Conventions** — Add historical report reading note. After the existing line about "Only create the report file" (line 268), add:

   ```
   - **Historical report reading:** When reading prior reports for deduplication, target ONLY
     the "Feature Requests & Feedback" section of each file. Do not re-read entire reports.
     Use bounded reads — load the Feature Requests table content, not the full file.
   ```

4. **Confinement Rules** — Add three new deduplication rules after the existing severity rules (after line 283):
   ```
   - **ALWAYS** read all existing telemetry reports from `_bmad-output/telemetry/` before writing the Feature Requests section — this is mandatory even if you believe no prior reports exist
   - **NEVER** create a duplicate feature request if a highly similar entry already exists in prior reports — increment the upvote count on the carried-forward entry instead
   - **ALWAYS** carry forward all prior feature requests with their accumulated upvote counts — the latest report is the canonical Feature Request ledger; do not silently drop prior requests
   ```

### What Must Be Preserved

- YAML frontmatter (name, description) — unchanged
- Activation triggers section — unchanged
- Introspection Protocol Steps 1-6 — unchanged (Step 5 severity assessment from 5.2 preserved)
- Template: Executive Summary, Sprint Context, Tools Used, Tools Omitted, Errors & Failures, Friction Points, Comparative Analysis, Appendix — all unchanged
- The Friction Points template table (5 columns with Severity and Justification from 5.2) — preserved
- Complete Tool Catalog Reference (all tools) — unchanged
- All pre-existing Confinement Rules (11 rules including 5.2's severity rules) — we append, not replace
- Output Conventions: save location, file naming, format, directory creation, collision handling, permission failure — all preserved
- The `_bmad-output/telemetry/` directory convention — preserved

### Design Decisions for the Dev Agent

1. **Why a cumulative ledger instead of editing old reports?**
   Editing historical reports is fragile and breaks audit trails. The cumulative ledger approach makes each new report the canonical, complete list of all outstanding feature requests. A maintainer only needs to read the latest report to see everything. This also avoids file-modification race conditions and preserves each sprint's original telemetry as an immutable record.

2. **Why "prefer consolidation" as the similarity tiebreaker?**
   The cost of a false negative (duplicate FRs) is higher than the cost of a false positive (over-merged FRs). Duplicate FRs spam maintainers and defeat the purpose of deduplication. Over-merged FRs can still be separated manually by a human reading the context field. When the LLM is uncertain, merging is the safer default.

3. **Why define similarity criteria with a table instead of open-ended prose?**
   LLMs perform better with structured comparison criteria than with vague instructions like "use your judgment." The four criteria (same tool, same problem, same category, semantic overlap) provide concrete anchors. The examples calibrate the threshold. This prevents both over-deduplication (everything looks the same) and under-deduplication (nothing looks the same).

4. **Why add an Output Convention about bounded reads?**
   After 10 sprints, the telemetry directory could contain 10+ reports of 200+ lines each. Reading all of them fully would waste tokens and potentially exceed context limits. The bounded-read convention tells the agent to extract only the Feature Requests section, keeping the operation lightweight regardless of historical volume.

5. **Why not apply deduplication to Friction Points too?**
   Friction points are sprint-specific experiences — what the agent actually encountered and felt. They are valuable as raw data points even if similar friction recurs. Feature requests, by contrast, are actionable synthesis. Deduplication prevents maintainer spam while preserving the raw friction signal. This aligns with the PRD and epic scope, which only mention deduplication for "feedback" and "bug reports" (Feature Requests), not for friction logs.

6. **Why keep the ID format as FR-{n}?**
   Continuity with 5.1's template. The sequential numeric ID provides a stable reference across reports, enabling exact cross-report identification. This is critical for the deduplication algorithm — the agent can match FR-3 in report A with FR-3 in report B by ID, not just by semantic similarity.

### Previous Story Intelligence

#### From Story 5.2 (Friction Severity Scoring)

- **Skill-only pattern:** Story 5.2 proved that single-file SKILL.md modifications can deliver functional requirements cleanly. This story continues that pattern — modify only SKILL.md. No scripts, no code, no `package.json` changes.
- **"Future stories" placeholder management:** The 5.2 story intentionally preserved the "future stories will add autonomous +1 upvote deduplication" note in the Feature Requests section. This story removes that note because we ARE that future story. No other placeholders remain in the template after this.
- **Review patches from 5.2 that inform 5.3:**
  - **Severity format (3 (Moderate)):** The pattern of `value (Label)` format was established for clarity. Upvotes use plain integers — no label needed since the count is self-explanatory.
  - **Empty handling:** 5.2 added "If no friction points were encountered, write 'None'" — same principle applies to Feature Requests: if the consolidated ledger is empty (first-ever report with no FRs), write "None" rather than omitting the section.
  - **Justification length enforcement:** 5.2 added "1-2 sentences" rule for severity justifications. For deduplication, the Context field in Feature Requests similarly benefits from concision — existing FR context descriptions should not be expanded when carrying forward.
  - **Feature request priority mapping:** 5.2 established that priority "should reflect the highest severity of the friction points that motivated the request" — this rule is preserved and applies when creating NEW feature requests in 5.3.
  - **Errors vs Friction overlap clarification:** 5.2 clarified that the same event can appear in both sections with different framing. This pattern does not extend to Feature Requests — FRs are synthesis, not raw events.
  - **Friction granularity (group related instances):** 5.2's "group related instances of the same underlying cause" maps cleanly to 5.3's deduplication — the same principle applied at a higher level.
  - **History unavailable + severity:** 5.2 added `~estimated` marking. For 5.3, if prior telemetry reports are unavailable (deleted or directory missing), note it explicitly but proceed — the first report becomes the baseline.
  - **Beyond-Critical escape:** 5.2 added "exceeds scale" for severity. No analog needed for upvotes — counts are unbounded integers.

#### From Story 5.1 (Markdown Telemetry Report Generation)

- **Skill-only pattern established:** Story 5.1 proved that skill-only stories work. The pattern of embedded template + protocol steps + confinement rules is well-established.
- **Review patches from 5.1:**
  - Tool catalog expanded to ~46 tools — unchanged in 5.3
  - Activation conditions clarified — unchanged in 5.3
  - Introspection Protocol structure (7 steps) — preserved, Step 7 expanded
  - Output conventions: directory/permission/conflict handling — preserved, bounded-read convention added
  - Timestamp collision handling — preserved
- **"Future stories" placeholder pattern established:** The template uses explicit placeholder notes. This story removes the LAST remaining placeholder. After 5.3, no "future stories" notes remain in the template.

#### From Story 4.3 (Manual Intervention and Fallback Override)

- **Skill description length:** Keep skill description under 200 chars (P9 patch). Our changes don't touch the description.
- **Content-based triggers:** Use content-based triggers, not story numbers (P10 patch). No trigger changes needed.

#### From Stories 3.1-3.4 (Adapters and Summarization)

- **Friction data sources:** Agents may report deduplication-relevant friction around adapter flags, timeout events, and stale index warnings. The similarity criteria include "same underlying problem" which would catch recurring timeout issues even if described differently each sprint.
- **Token budget awareness:** While NFR1 doesn't directly apply to telemetry, the bounded-read convention (read only Feature Requests sections, not full reports) is a practical optimization informed by the token budget mindset.

### Git Intelligence

Recent commits show a consistent pattern:

- `feat(story-X.Y): description` — use this format for the 5.3 commit
- `fix(memtrace): description` — for patches/corrections
- All telemetry work is in `.agents/skills/bmad-memtrace-telemetry/SKILL.md`
- Testing: `node --test`, `npm run quality`, `npm run validate:skills`
- No adapter or script changes in telemetry stories (5.1, 5.2, 5.3)

### Output Contract

- **File modified:** `.agents/skills/bmad-memtrace-telemetry/SKILL.md` (template, protocol Step 7, confinement rules)
- **No new files created**
- **No scripts modified** — `memtrace-adapter.mjs`, `qa-memtrace.mjs`, `package.json`, and all other files remain untouched
- **Feature Requests table now has 5 columns:** ID | Request | Priority | Upvotes | Context
- **Deduplication protocol embedded in Step 7** (7a, 7b, 7c)
- **"Future stories" deduplication note removed from template**
- **All prior sections (Steps 1-6, all template sections except Feature Requests) unchanged**
- **Appended 3 new Confinement Rules (rules 14-16)**
- **Appended 1 new Output Convention (bounded historical reads)**

### Testing Requirements

#### Automated Tests

**None.** This story modifies only the telemetry skill markdown file — no executable code. All existing test suites pass unchanged.

#### Structural Verification

- [ ] SKILL.md frontmatter unchanged: `name: bmad-memtrace-telemetry`
- [ ] SKILL.md frontmatter unchanged: `description` under 200 chars
- [ ] Feature Requests template table has 5 columns (not 4)
- [ ] `Upvotes` column present between `Priority` and `Context`
- [ ] "Future stories will add autonomous +1 upvote deduplication" placeholder text is removed
- [ ] Introspection Protocol Step 7 includes sub-steps 7a (Read Historical Reports), 7b (Detect Duplicates), 7c (Build Consolidated Ledger)
- [ ] Similarity criteria table is present with 4 rows (same tool, same problem, same category, semantic overlap)
- [ ] "Prefer consolidation" tiebreaker guidance is present
- [ ] Confinement Rules includes 3 new deduplication-related rules (total 14 rules)
- [ ] Output Conventions includes bounded-read guidance for historical reports
- [ ] All pre-existing template sections (Executive Summary through Appendix) are unchanged
- [ ] Complete Tool Catalog Reference is unchanged
- [ ] Activation triggers section is unchanged
- [ ] Introspection Steps 1-6 are unchanged (Step 5 severity assessment preserved from 5.2)
- [ ] Only `.agents/skills/bmad-memtrace-telemetry/SKILL.md` was modified — no other files touched

#### Regression Tests (ALL must pass — NO changes to any scripts)

```bash
node --test _bmad/scripts/memtrace/memtrace-adapter.test.mjs    # 32+ tests must pass
node --test _bmad/scripts/memtrace/qa-memtrace.test.mjs         # 10 tests must pass
node --test _bmad/scripts/memtrace/validate-dead-code.test.mjs  # 12 tests must pass
node --test _bmad/scripts/memtrace/memtrace-restart.test.mjs    # 8 tests must pass
```

```bash
npm run quality
npm run validate:skills
```

#### Manual Verification

- [ ] The deduplication protocol (7a-7c) is clear and actionable
- [ ] Similarity criteria are specific enough to prevent both over- and under-deduplication
- [ ] "Prefer consolidation" guidance is prominent
- [ ] The Feature Requests table format supports carry-forward from prior reports
- [ ] All existing template sections are preserved without drift
- [ ] No "future stories" placeholders remain anywhere in the template
- [ ] All existing test suites pass with zero regressions
- [ ] Git diff shows changes ONLY in `.agents/skills/bmad-memtrace-telemetry/SKILL.md`

### References

- [Source: epics.md#Story 5.3] — User story and AC: "read historical feedback logs and deduce if my feedback already exists..."
- [Source: epics.md#Epic 5] — Epic goal: Autonomous Ecosystem Telemetry Loop; FR24-FR27
- [Source: epics.md#FR27] — Agents can deduce if feedback already exists and apply an autonomous +1 upvote increment to avoid duplicate reports
- [Source: prd.md#Innovation — Self-Deduplicating LLM Telemetry] — "Utilizing an autonomous +1 upvote mechanism where the LLM reads previous feedback and increments counters for duplicate issues, completely preventing LLM spam"
- [Source: prd.md#Journey 3 (Sarah)] — "the agent reads the existing feedback log before writing; if a suggestion already exists, it simply adds an upvote (+1)"
- [Source: prd.md#FR27] — Functional requirement definition
- [Source: architecture.md#Cross-Cutting Concerns] — "Deduplicação inteligente de feedbacks (+1 upvote logic)"
- [Source: architecture.md#Project Structure] — `.agents/skills/` for agent workflows
- [Source: architecture.md#Implementation Patterns] — kebab-case directories; no new scripts in story
- [Source: architecture.md#NFR1 Token Budget] — 2000 token limit (noted as non-applicable but informing bounded-read convention)
- [Source: story-file 5.2] — Previous story intelligence: severity patterns, review patches, "future stories" management
- [Source: story-file 5.1] — Base telemetry skill creation; template and protocol structure
- [Source: .agents/skills/bmad-memtrace-telemetry/SKILL.md] — Current skill file (283 lines, post-5.2) to be modified
- [Source: project-context.md] — Repository location: `D:\Repos\bmad-memtrace\bmad-memtrace` is project root
- [Source: package.json] — `npm run quality` and `npm run validate:skills` for regression validation

## Dev Agent Record

### Agent Model Used

opencode-go/deepseek-v4-flash

### Debug Log References

- **Blast radius:** empty (markdown-only file — no executable code symbols)
- **Mathematical Quality Gate:** SKIPPED (empty blast radius — Phase 1 pattern; consider upgrading to qa-memtrace.mjs for stories with executable code blast radius)
- **Dead Code Pitfall Validation:** SKIPPED (no dead-code removal in story)
- **Regression tests:** 39/39 adapter, 10/10 qa-memtrace, 12/12 validate-dead-code, 8/8 memtrace-restart — all pass

### Completion Notes List

- **Task 1** (Feature Requests template): Updated Feature Requests table from 4 columns (ID, Request, Priority, Context) to 5 columns (ID, Request, Priority, Upvotes, Context). Removed the "future stories will add autonomous +1 upvote deduplication" placeholder note. Added cumulative ledger guidance.
- **Task 2** (Deduplication protocol): Replaced Step 7's brief guidance with full deduplication protocol: 7a (Read Historical Reports), 7b (Detect Duplicates with similarity criteria table), 7c (Build Consolidated Ledger with carry-forward logic). Added "prefer consolidation" tiebreaker.
- **Task 3** (Confinement Rules): Appended 3 new deduplication rules: ALWAYS read prior reports, NEVER create duplicate FR, ALWAYS carry forward accumulated upvotes.
- **Task 4** (Validation): All structural verification checks pass. Frontmatter unchanged (name: bmad-memtrace-telemetry, description under 200 chars). Feature Requests table has 5 columns. Placeholder removed. Step 7 has 7a/7b/7c. Similarity criteria table present with 4 criteria. Confinement Rules has 14 rules (11 original + 3 new). Output Conventions includes bounded-read guidance. All pre-existing sections intact. Only SKILL.md was modified. Regression tests all pass.
- **AC #1** ✓ — Agent reads historical feedback logs and increments upvote on existing entry instead of creating duplicate
- **AC #2** ✓ — Step 7 guides agent through historical log reading, similarity detection, and consolidated ledger building with concrete criteria
- **AC #3** ✓ — Feature Requests table includes Upvotes column; placeholder note removed; cumulative carry-forward mechanism documented

### File List

| File                                              | Action | Description                                                                                                                                                                                            |
| ------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `.agents/skills/bmad-memtrace-telemetry/SKILL.md` | UPDATE | Add Upvotes column to Feature Requests table, replace placeholder with deduplication protocol in Step 7, add deduplication rules to Confinement Rules, add bounded-read guidance to Output Conventions |
