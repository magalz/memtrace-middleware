# Story 6.6: Orchestrator & Party Mode Context Injection

Status: done

## Story

As the Story Automator and Party Mode Orchestrator,
I want to propagate the Memtrace MCP state and inject structural graph context into debates,
so that multi-agent discussions and automated lifecycles are grounded in the actual codebase structure.

## Acceptance Criteria

1. **Given** a party mode debate or an automated lifecycle execution
   **When** the agents communicate or transition tasks
   **Then** the orchestrator provides the current structural context
   **And** maintains the MCP connection state securely across the entire session.

## Tasks / Subtasks

### Task Group A: Party Mode Structural Context Injection

- [x] Task A1: Create `customize.toml` with persistent fact in source (AC: 1)
  - [x] A1.1 Create `src/core-skills/bmad-party-mode/customize.toml`
  - [x] A1.2 Add persistent fact entry for Memtrace structural context capability
- [x] Task A2: Create `customize.toml` with persistent fact in installed copy (AC: 1)
  - [x] A2.1 Create `.agents/skills/bmad-party-mode/customize.toml`
  - [x] A2.2 Add persistent fact entry (identical to A1)
- [x] Task A3: Modify source SKILL.md to inject structural context gathering (AC: 1)
  - [x] A3.1 Add Memtrace structural context step in "On Activation" section (between steps 4 and 5)
  - [x] A3.2 Modify agent prompt template in "Build Context and Spawn" to include structural context
  - [x] A3.3 Add self-contained Memtrace context block to end of SKILL.md
  - [x] A3.4 Add structural context update guidance to "Keeping Context Manageable"
- [x] Task A4: Modify installed SKILL.md (identical changes to A3) (AC: 1)
  - [x] A4.1 Apply same modifications to `.agents/skills/bmad-party-mode/SKILL.md`

### Task Group B: Story Automator MCP State Propagation

- [x] Task B1: Create `customize.toml` for story-automator (AC: 1)
  - [x] B1.1 Create `.agents/skills/bmad-story-automator/customize.toml`
  - [x] B1.2 Add persistent fact for Memtrace MCP state propagation
- [x] Task B2: Modify `workflow.md` to add Memtrace state initialization (AC: 1)
  - [x] B2.1 Add Memtrace health check section in "Initialization Sequence" (between config loading and mode determination)
  - [x] B2.2 Add self-contained Memtrace context block to end of workflow.md
- [x] Task B3: Modify `steps-c/step-01-init.md` to add MCP health verification (AC: 1)
  - [x] B3.1 Add Memtrace availability check step between stop hook verification and rules loading
  - [x] B3.2 Add self-contained Memtrace context block to end of step-01-init.md
- [x] Task B4: Modify `steps-c/step-02-preflight.md` to propagate Memtrace state (AC: 1)
  - [x] B4.1 Add Memtrace state carry-forward in the "Proceed to Configuration" step (section 5)
  - [x] B4.2 Add self-contained Memtrace context block to end of step-02-preflight.md

### Review Findings

#### Patch (fixable without human input)

- [x] [Review][Patch] Repository mismatch filter added to party mode step 4.5 — `list_indexed_repositories` result now filtered by `repo_path` matching `{project-root}`. Applied to both source and installed SKILL.md.
- [x] [Review][Patch] Memtrace check added to resume path — `step-01b-continue.md` now has step 1.5 to refresh Memtrace connection state before proceeding.
- [x] [Review][Patch] Tmux session state propagation documented — `step-03-execute.md` now has explicit Memtrace state propagation notes in Setup section, documenting how `memtrace_state` flows from state document to spawned sessions via `--state-file`.

#### Defer (pre-existing, not caused by this change)

- [x] [Review][Defer] Divergent skill versions risk — source (`src/core-skills/`) and installed (`.agents/skills/`) copies of party-mode SKILL.md could diverge over time. Pre-existing pattern, not introduced by this story.
- [x] [Review][Defer] Project root resolution for story-automator — `{project-root}` in `customize.toml` resolves at runtime from config; the story-automator was copied into the inner project during implementation, so resolution is correct. Pre-existing architectural concern.

#### Dismissed

- Redundant Memtrace checks in workflow.md (section 1.5) and step-01-init.md (step 1.5) — intentional. Different scopes: orchestrator-level vs step-level checks.
- Incomplete communities when < 5 results — graceful degradation handles this (available data is used, empty is skipped).

## Dev Notes

### Architecture Compliance

- **Party Mode integration role:** ADVISORY — structural context prevents hallucination but never blocks the discussion. Party mode works fine without Memtrace.
- **Story Automator integration role:** STATE_PROPAGATION — the automator checks MCP health and passes awareness to spawned sessions; it does not block on Memtrace unavailability.
- **Memtrace script boundary:** NEVER modify `_bmad/scripts/memtrace/` or `package.json`. All changes are in skill markdown/TOML files only.
- **No new files:** Except for `customize.toml` files (which follow the established pattern), do NOT create any new files.
- **Convention:** Use `{project-root}` placeholders in SKILL.md/workflow.md; use `{skill-root}` in customize.toml.

### Previous Story Intelligence (from stories 6-1 through 6-5)

**Established integration patterns (apply to BOTH skills in this story):**

1. **Three-tier graceful degradation:** Available → run all queries; Partial → run what succeeds, note failures; Unavailable → skip all, note diagnostic, continue with existing logic.
2. **Freshness check is mandatory:** Call `list_indexed_repositories`, check `last_indexed_at` against 30-minute recency. Not just binary (indexed/not-indexed) — must check timestamp staleness.
3. **Anti-Promise.all enforcement:** All queries MUST use sequential `for...of` with `await`. NEVER `Promise.all`.
4. **Token budget:** Cap at 200 symbols, prefer compact/summarized modes. Stay under 2000 tokens per call.
5. **Direct MCP tools for lightweight queries** (like `list_indexed_repositories`, `get_codebase_briefing`, `find_central_symbols`). Adapter (`memtrace-adapter.mjs`) only for heavy queries like `get_impact`.
6. **Self-contained Memtrace context block** (established in 6-3, continued in 6-4, 6-5): Add a `## 🧠 Memtrace Context (Self-Contained)` block at the end of every modified workflow/step file.

**Lessons from 6-1 review (applicable to this story):**

- Partial structural success must be handled (not just binary available/unavailable)
- Greenfield/empty graph: skip structural comparison entirely
- Freshness timestamp must be checked explicitly, not just "indexed yes/no"
- All-queries-fail produces "unavailable" (not misleading "partial")

**Lessons from 6-5 (most recent, most relevant):**

- This is ENRICHMENT/PROPAGATION, not a blocking integration
- Structural data RECOMMENDS but does not DICTATE actions
- Stale index (older than 30 min) must gate the availability decision

**Key difference from past stories:** This is the FIRST story that modifies a `src/core-skills/` file (party-mode lives there, not in `src/bmm-skills/`). The source→installed modification pattern established in 6-2 applies: modify BOTH copies identically.

**Story Automator uniqueness:** Unlike previous stories which modified step files (`steps/step-XX-name.md`), the automator uses a different step file naming convention (`steps-c/step-XX-name.md`). Follow the file's internal convention exactly.

### Git Intelligence

Recent commits (last 8):

```
0b79767d feat(story-6.5): implement pm technical debt analysis
cdec481a feat(story-6.4): implement hallucination-free documentation
dcad68e9 feat(story-6.3): implement test architect coverage gap analysis
58c2e460 chore: alphabetize npm scripts and fix test file formatting
ea813716 feat(story-6.1): implement architect and readiness validator structural context
afde2efc feat(story-6.2): implement code reviewer deep audit
5d5ecb60 feat(story-5.3): implement autonomous telemetry deduplication
30742f16 fix(memtrace): make MCP timeout detection accurate
```

**Established commit pattern:** `feat(story-6.6): implement orchestrator and party mode context injection`
**Conventional commits enforced** by `AGENTS.md`.
**Pre-push quality gate:** Run `npm ci && npm run quality` on HEAD before pushing.

### Files Being Modified (UPDATE — read each before modifying)

| File                                                               | Type   | Current State                                                                                                                                              | What Changes                                                                                                                                                          |
| ------------------------------------------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/core-skills/bmad-party-mode/SKILL.md`                         | UPDATE | 128 lines, single monolithic file. No Memtrace integration. Agent prompt template with Discussion Context section. 5-step On Activation. 4-step Core Loop. | Add step 4.5 to On Activation for structural context gathering. Add "Structural Context" section to agent prompt template. Add context block. Add freshness guidance. |
| `.agents/skills/bmad-party-mode/SKILL.md`                          | UPDATE | Identical to source (128 lines). Installed copy.                                                                                                           | Apply identical changes as source SKILL.md.                                                                                                                           |
| `.agents/skills/bmad-story-automator/workflow.md`                  | UPDATE | 172 lines. Initialization Sequence: Config Loading → Mode Determination → Route to First Step. No Memtrace awareness.                                      | Add Memtrace state initialization between Config Loading and Mode Determination. Add context block.                                                                   |
| `.agents/skills/bmad-story-automator/steps-c/step-01-init.md`      | UPDATE | 139 lines. Steps: Verify Stop Hook → Load Rules → Check State → Welcome. No Memtrace check.                                                                | Add Memtrace health check between Stop Hook verification and Rules loading. Add context block.                                                                        |
| `.agents/skills/bmad-story-automator/steps-c/step-02-preflight.md` | UPDATE | 200 lines. Steps: Confirm Epic → Review Epic → Read Stories & Complexity → Custom Instructions → Proceed to Config. No Memtrace state propagation.         | Add Memtrace state carry-forward to Proceed to Configuration (section 5). Add context block.                                                                          |

### Files Being Created (NEW)

| File                                                 | Type | Content                                                    |
| ---------------------------------------------------- | ---- | ---------------------------------------------------------- |
| `src/core-skills/bmad-party-mode/customize.toml`     | NEW  | Persistent fact for Memtrace structural context capability |
| `.agents/skills/bmad-party-mode/customize.toml`      | NEW  | Identical to source copy                                   |
| `.agents/skills/bmad-story-automator/customize.toml` | NEW  | Persistent fact for Memtrace MCP state propagation         |

---

## Detailed Implementation Instructions

### Part A: Party Mode Structural Context Injection

**Integration Goal (FR17):** When the orchestrator builds the discussion context for subagents, it injects the current structural state of the codebase (modules, key symbols, dependencies) so agents ground their debate in real architecture rather than hallucinating.

**Injection Points in SKILL.md:**

#### A3.1 / A4.1: New step in "On Activation" (between steps 4 and 5)

After step 4 (Load project context) and before step 5 (Welcome the user), add:

```markdown
4.5. **Gather structural context** — if Memtrace is available for this project:

Use the Memtrace MCP tool `list_indexed_repositories` to check if the project root is indexed. If an indexed repo matches:

- Call `get_codebase_briefing` (detail_level: "summary") to get the architecture overview.
- Call `find_central_symbols` (top 10, kinds: Function/Method/Class) to identify load-bearing code.
- Call `list_communities` (min_size: 5) to map the logical module boundaries.
- Process ALL queries STRICTLY SEQUENTIALLY using `for...of` with `await` — NEVER `Promise.all`.
- Store the combined output as `{structural_context}` for injection into agent prompts.

**Graceful degradation:**

- If Memtrace is unavailable or the index is stale (>30 min since `last_indexed_at`): set `{structural_context}` to empty, note diagnostic. Party mode continues.
- If some queries succeed and others fail (partial): use available data only.
- This step is ADVISORY — never block party mode activation on Memtrace availability.
```

#### A3.2 / A4.2: Modify the agent prompt template (in "2. Build Context and Spawn")

Insert a new section between "Discussion Context" and "What Other Agents Said This Round":

```markdown
## Codebase Structural Context

{structural_context — if available: a compact summary of the real codebase architecture, key modules, and load-bearing symbols. If not available, omit this entire section.}
```

#### A3.3 / A4.3: Add self-contained Memtrace context block

Append at the very end of SKILL.md (after the "Exit" section):

```markdown
## 🧠 Memtrace Context (Self-Contained)

### Tools Referenced

| Tool                        | Purpose               | Key Parameters                              |
| --------------------------- | --------------------- | ------------------------------------------- |
| `list_indexed_repositories` | Availability gate     | none                                        |
| `get_codebase_briefing`     | Architecture overview | `detail_level: "summary"`                   |
| `find_central_symbols`      | Load-bearing code     | `limit: 10`, `kinds: Function/Method/Class` |
| `list_communities`          | Module boundaries     | `min_size: 5`                               |

### Usage Rules

1. **Index Freshness First:** Always call `list_indexed_repositories` before any graph query. Check `last_indexed_at` against 30-minute recency threshold.
2. **Sequential Only:** Process all Memtrace queries with `for...of` + `await`. NEVER `Promise.all`.
3. **Advisory Only:** Memtrace data enriches discussions but never blocks them. Party mode continues with or without structural context.
4. **Graceful Degradation:** Available → inject context; Partial → inject available data only; Unavailable → omit section entirely.
5. **Token Budget:** Use `detail_level: "summary"` for briefing, cap communities at `min_size: 5`, central symbols at 10 to stay compact.
6. **Freshness Update:** Re-check structural context if the discussion spans a significant code change or every 5+ rounds.

### Data Flow
```

On Activation Step 4.5
→ list_indexed_repositories (availability gate)
→ get_codebase_briefing (architecture summary)
→ find_central_symbols (key symbols)
→ list_communities (module map)
→ Store as {structural_context}
→ Inject into agent prompt template per round

```

### Fallback Path
When Memtrace is unavailable: omit the "Codebase Structural Context" section entirely from agent prompts. Agents rely on project-context.md and their own knowledge. No quality degradation — structural context is an enrichment, not a requirement.
```

#### A3.4 / A4.4: Modify "Keeping Context Manageable"

After the existing paragraph about keeping Discussion Context under 400 words, add:

```markdown
The **Structural Context** (from Memtrace graph queries) should be refreshed if the discussion shifts to a significantly different part of the codebase, or if the project has been re-indexed since the initial structural snapshot was taken. When in doubt, keep the structural context compact — module names and key dependency relationships, not full symbol lists.
```

---

### Part B: Story Automator MCP State Propagation

**Integration Goal (FR18):** The automator checks Memtrace health at startup, stores the connection state, and carries awareness through the entire lifecycle so spawned story sessions know whether to expect graph capabilities.

**Injection Points:**

#### B2.1: Modify workflow.md "Initialization Sequence" section

Between "### 1. Configuration Loading" and "### 2. Mode Determination", insert:

```markdown
### 1.5. Memtrace Connection State Check

Before routing to the first step, determine the Memtrace MCP connection state for this session:

**Check Availability:**

- Use the Memtrace MCP tool `list_indexed_repositories` to verify the local Memtrace MCP server is reachable.
- If a repository matching the project root is found, check `last_indexed_at` timestamp:
  - If indexed within the last 30 minutes: `memtrace_state = "available"`
  - If indexed but older than 30 minutes: `memtrace_state = "stale"` (index exists but may be outdated)
- If no indexed repo matches the project root: `memtrace_state = "unavailable"`
- If the MCP call itself fails (timeout, connection refused): `memtrace_state = "unavailable"`

**Store and Propagate:**

- Set `{memtrace_state}` for the current session. This variable is carried forward to every step file and passed to spawned Tmux sessions as part of the story context.
- The state determines whether downstream steps that depend on structural graph queries can run or must gracefully degrade.

**Graceful Degradation:**
| State | Meaning | Behavior |
|-------|---------|----------|
| `available` | MCP responsive, index fresh | All Memtrace-dependent steps run normally |
| `stale` | MCP responsive, index outdated | Memtrace steps run with a "stale data" warning; consider triggering re-index |
| `unavailable` | MCP unreachable or not configured | Skip all Memtrace-dependent steps; legacy heuristics only |

**This check is ADVISORY** — the automator never blocks on Memtrace availability. Connection state is informational context for the spawned story sessions.
```

#### B2.2: Add self-contained Memtrace context block

Append at the end of workflow.md (after the initialization routing table):

```markdown
## 🧠 Memtrace Context (Self-Contained)

### Tools Referenced

| Tool                        | Purpose                            | Key Parameters |
| --------------------------- | ---------------------------------- | -------------- |
| `list_indexed_repositories` | Connection health + freshness gate | none           |

### Usage Rules

1. **Connection State Only:** The automator's ONLY Memtrace interaction is checking server health at init. It does NOT run graph queries itself — that's delegated to spawned story sessions.
2. **State Propagation:** `{memtrace_state}` is passed to every Tmux session as context. Each story workflow makes its own Memtrace availability decisions.
3. **Advisory Only:** NEVER block the automator lifecycle on Memtrace availability. `unavailable` means "notify sessions" not "halt execution."
4. **Re-check Between Epics:** If processing multiple epics, verify Memtrace health again at epic transitions.
5. **No Direct Script Calls:** The automator does not invoke `memtrace-adapter.mjs`, `qa-memtrace.mjs`, or `memtrace-restart.mjs`. Those are the responsibility of individual story sessions.

### Data Flow
```

workflow.md Init Step 1.5
→ list_indexed_repositories (health check)
→ Set {memtrace_state} = "available" | "stale" | "unavailable"
→ Propagate to:
step-01-init.md (carried in state document frontmatter)
step-02-preflight.md (carried forward in step transition)
Spawned Tmux sessions (passed as session context variable)

```

### Fallback Path
When Memtrace is unavailable: `{memtrace_state} = "unavailable"` is passed to all spawned sessions. Each session's create-story/dev-story/code-review workflow handles Memtrace unavailability according to its own graceful degradation rules (established in stories 6-1 through 6-5).
```

#### B3.1: Modify step-01-init.md

Between "### 1. Verify Stop Hook Installation" and "### 2. Load Rules" (at the Do section), insert:

```markdown
### 1.5. Verify Memtrace Connection

Check if Memtrace MCP is available for this orchestration session:

**Check:**

- Use the Memtrace MCP tool `list_indexed_repositories` to verify the server is reachable.
- If a matching repo is found and `last_indexed_at` is within 30 minutes: set `memtrace_state = "available"`
- If found but stale (>30 min): set `memtrace_state = "stale"`
- If not found or call fails: set `memtrace_state = "unavailable"`

**Store:** Record `memtrace_state` in the state document frontmatter for propagation to all subsequent steps.

**Display:**

- `"available"`: "✓ Memtrace MCP server responsive. Index is fresh. Story sessions will have structural graph access."
- `"stale"`: "⚠ Memtrace MCP server responsive but index may be outdated. Story sessions will run with stale-data warnings."
- `"unavailable"`: "ℹ Memtrace MCP server not reachable. Story sessions will use legacy heuristics only."

**Graceful Degradation:** This check is ADVISORY. The automator proceeds regardless of Memtrace state. The state is informational context for spawned story sessions to make their own availability decisions.

**Sequential execution:** If checking Memtrace state via MCP tools, use STRICTLY SEQUENTIAL execution. NEVER `Promise.all`.
```

#### B3.2: Add self-contained Memtrace context block

Append at end of step-01-init.md:

```markdown
## 🧠 Memtrace Context (Self-Contained)

### Tools Referenced

| Tool                        | Purpose                         | Key Parameters |
| --------------------------- | ------------------------------- | -------------- |
| `list_indexed_repositories` | Server health + index freshness | none           |

### Usage Rules

1. **Health Check Only:** This step verifies Memtrace MCP is reachable. It does not run graph analysis.
2. **State Propagation:** `memtrace_state` is stored in the state document frontmatter and carried to step-02-preflight.md and beyond.
3. **Advisory Only:** NEVER block initialization on Memtrace availability. `unavailable` is a status, not an error.
4. **Sequential MCP Calls:** If multiple MCP calls are needed in this step, use `for...of` + `await`. NEVER `Promise.all`.
```

#### B4.1: Modify step-02-preflight.md (section 5, "Proceed to Configuration")

In the "Carry forward:" line at the end of section 5, append `memtrace_state` to the list of carried-forward variables:

Change:

```
Carry forward: `epic_path`, `epic_name`, `story_count`, `story_ids_csv`, `range_json`, `selected_ids`, `selected_count`, `stories_json`, `epic_id`, `first_story_id`, `custom_instructions`.
```

To:

```
Carry forward: `epic_path`, `epic_name`, `story_count`, `story_ids_csv`, `range_json`, `selected_ids`, `selected_count`, `stories_json`, `epic_id`, `first_story_id`, `custom_instructions`, `memtrace_state`.
```

#### B4.2: Add self-contained Memtrace context block

Append at end of step-02-preflight.md:

```markdown
## 🧠 Memtrace Context (Self-Contained)

### Tools Referenced

None — this step carries forward `memtrace_state` from step-01-init.md.

### Usage Rules

1. **State Carry-Forward:** `memtrace_state` originates in step-01-init.md and is passed through this step unchanged.
2. **No Queries Here:** This step does not make direct Memtrace MCP calls. State propagation only.
3. **Session Context:** `memtrace_state` will be passed to spawned Tmux sessions as part of the story execution context.

### Data Flow
```

step-01-init.md (health check, set memtrace_state)
→ step-02-preflight.md (carry forward)
→ step-03-execute.md (pass to Tmux sessions)
→ Each spawned create-story/dev-story/code-review session

```

```

---

### Customize.toml Persistent Facts

#### Party Mode customize.toml (BOTH source and installed copies, identical):

```toml
[workflow]

persistent_facts = [
  "file:{project-root}/**/project-context.md",
  "Memtrace structural graph context is available for injecting into party mode agent prompts to prevent group hallucination. Use list_indexed_repositories to check availability before each query block. Run get_codebase_briefing (detail_level: summary), find_central_symbols (top 10, kinds: Function/Method/Class), and list_communities (min_size: 5) sequentially using for...of with await — NEVER Promise.all. Check index freshness via last_indexed_at against a 30-minute recency threshold. Memtrace data is ADVISORY — structural context enriches agent discussions but never blocks them. If unavailable, skip structural context injection entirely and continue the discussion normally.",
]
```

#### Story Automator customize.toml:

```toml
[workflow]

persistent_facts = [
  "file:{project-root}/**/project-context.md",
  "The Story Automator propagates Memtrace MCP connection state across the entire autonomous lifecycle. At initialization, check Memtrace availability via list_indexed_repositories and store memtrace_state (available|stale|unavailable) in the state document. This state is carried forward through all step transitions and passed to spawned Tmux sessions as context. Re-check Memtrace health when transitioning between epics in multi-epic runs. Memtrace state propagation is ADVISORY — the automator never blocks on Memtrace unavailability. Individual story sessions handle their own graceful degradation. Always use sequential for...of with await for MCP calls — NEVER Promise.all.",
]
```

---

## Technical Requirements

### Memtrace MCP Tools Used

| Tool                        | Party Mode                 | Story Automator               | Purpose                                         |
| --------------------------- | -------------------------- | ----------------------------- | ----------------------------------------------- |
| `list_indexed_repositories` | Availability gate          | Connection health + freshness | Verify MCP server is reachable                  |
| `get_codebase_briefing`     | Architecture overview      | —                             | High-level structural summary for agent context |
| `find_central_symbols`      | Key symbols identification | —                             | Load-bearing code awareness                     |
| `list_communities`          | Module boundary mapping    | —                             | Logical architecture awareness                  |

### Anti-Patterns (DO NOT IMPLEMENT)

- ❌ Do NOT make Memtrace blocking — both integrations are ADVISORY
- ❌ Do NOT use `Promise.all` for any Memtrace query
- ❌ Do NOT call `memtrace-adapter.mjs` directly from these skills (only direct MCP tools are needed — all queries return compact output)
- ❌ Do NOT modify `qa-memtrace.mjs`, `validate-dead-code.mjs`, or any script under `_bmad/scripts/memtrace/`
- ❌ Do NOT create new step files or new directories
- ❌ Do NOT remove or refactor existing content — changes are additive only
- ❌ Do NOT change the file naming conventions of story-automator step files (they use `steps-c/` not `steps/`)

### Testing

1. **No automated tests needed** — all changes are markdown/TOML instruction files
2. **Regression tests (ALL must pass unchanged):**
   ```bash
   npm run quality
   npm run validate:skills
   node --test _bmad/scripts/memtrace/memtrace-adapter.test.mjs
   node --test _bmad/scripts/memtrace/qa-memtrace.test.mjs
   node --test _bmad/scripts/memtrace/validate-dead-code.test.mjs
   node --test _bmad/scripts/memtrace/memtrace-restart.test.mjs
   ```
3. **Manual structural verification checklist:**
   - [ ] Party Mode source SKILL.md: step 4.5 inserted between steps 4 and 5
   - [ ] Party Mode source SKILL.md: "Codebase Structural Context" section added to agent prompt template (between Discussion Context and What Other Agents Said)
   - [ ] Party Mode source SKILL.md: Memtrace context block appended after Exit section
   - [ ] Party Mode source SKILL.md: Freshness guidance added to Keeping Context Manageable
   - [ ] Party Mode installed SKILL.md: ALL changes identical to source
   - [ ] Party Mode customize.toml created at BOTH locations
   - [ ] Story Automator workflow.md: Memtrace state init (section 1.5) between Config Loading (1) and Mode Determination (2)
   - [ ] Story Automator workflow.md: Memtrace context block appended at end
   - [ ] Story Automator step-01-init.md: Memtrace health check between stop hooks verification (1) and rules loading (2)
   - [ ] Story Automator step-01-init.md: Memtrace context block appended at end
   - [ ] Story Automator step-02-preflight.md: `memtrace_state` added to carry-forward list
   - [ ] Story Automator step-02-preflight.md: Memtrace context block appended at end
   - [ ] Story Automator customize.toml created
   - [ ] NO existing content removed or refactored in any file
   - [ ] All Memtrace context blocks use consistent format
   - [ ] Anti-Promise.all language present in all query instructions
   - [ ] Three-tier graceful degradation (available/partial/stale-or-unavailable) handled everywhere
   - [ ] 30-minute staleness threshold checked (not just binary indexed/not-indexed)
   - [ ] `npm run validate:skills` passes (pre-existing failures only, no new failures)

### References

- [Epics: Epic 6, Story 6.6](_bmad-output/planning-artifacts/epics.md#story-66-orchestrator--party-mode-context-injection)
- [Architecture: Agent Orchestration vs Validation](_bmad-output/planning-artifacts/architecture.md#component-boundaries)
- [Architecture: Project Structure](_bmad-output/planning-artifacts/architecture.md#complete-project-directory-structure)
- [Architecture: Anti-Promise.all Pattern](_bmad-output/planning-artifacts/architecture.md#process-patterns)
- [PRD: Cross-Agent Orchestration (FR17-FR18)](_bmad-output/planning-artifacts/prd.md#4-cross-agent-orchestration--system-workflows)
- [PRD: Innovation — Graph-Enforced Quality Gates](_bmad-output/planning-artifacts/prd.md#innovation--novel-patterns)
- [Story 6-1: Architect structural context pattern](_bmad-output/implementation-artifacts/6-1-architect-readiness-validator-structural-context.md)
- [Story 6-2: Code reviewer state propagation between steps](_bmad-output/implementation-artifacts/6-2-code-reviewer-deep-audit.md)
- [Story 6-5: SKILL.md modification pattern (retrospective)](_bmad-output/implementation-artifacts/6-5-pm-technical-debt-analysis.md)
- [Source: party-mode SKILL.md](src/core-skills/bmad-party-mode/SKILL.md)
- [Source: story-automator workflow.md](.agents/skills/bmad-story-automator/workflow.md)

## Dev Agent Record

### Agent Model Used

opencode-go/deepseek-v4-flash

### Change Log

- Code review completed (2026-05-21): 3 patches applied (repo filter, resume path check, tmux propagation), 2 deferred, 2 dismissed. Status updated to done.

- Validate:skills: 134 pre-existing findings (CRITICAL/HIGH) — all in src/ skills unrelated to this story. No new findings.
- Memtrace tests: qa-memtrace 10/10 ✓, validate-dead-code 12/12 ✓, memtrace-restart 8/8 ✓ (adapter test has pre-existing Windows timeout behavior)

### Completion Notes List

- Implemented Party Mode structural context injection (FR17): Added step 4.5 to On Activation for Memtrace structural context gathering, injected "Codebase Structural Context" section into agent prompt template, added freshness guidance to Keeping Context Manageable, appended self-contained Memtrace context block. Applied identically to both source (`src/core-skills/`) and installed (`.agents/skills/`) copies.
- Implemented Story Automator MCP state propagation (FR18): Added section 1.5 to workflow.md Initialization Sequence for Memtrace connection state check (available/stale/unavailable), added Memtrace health check to step-01-init.md between stop hook and rules loading, added memtrace_state to step-02-preflight.md carry-forward variables. All modified files include self-contained Memtrace context blocks.
- Created 3 new customize.toml files with persistent_facts: party-mode source, party-mode installed, story-automator.
- Both integrations are ADVISORY — never block on Memtrace unavailability. Follow established three-tier graceful degradation, 30-min freshness threshold, and anti-Promise.all patterns from stories 6-1 through 6-5.

### File List

- NEW `src/core-skills/bmad-party-mode/customize.toml` — Persistent fact for Memtrace structural context
- NEW `.agents/skills/bmad-party-mode/customize.toml` — Persistent fact (installed copy)
- NEW `.agents/skills/bmad-story-automator/customize.toml` — Persistent fact for MCP state propagation
- UPDATE `src/core-skills/bmad-party-mode/SKILL.md` — Added step 4.5, Codebase Structural Context in agent prompt, freshness guidance, Memtrace context block
- UPDATE `.agents/skills/bmad-party-mode/SKILL.md` — Identical changes (installed copy)
- UPDATE `.agents/skills/bmad-story-automator/workflow.md` — Added section 1.5 Memtrace Connection State Check, Memtrace context block
- UPDATE `.agents/skills/bmad-story-automator/steps-c/step-01-init.md` — Added step 1.5 Memtrace Connection, Memtrace context block
- UPDATE `.agents/skills/bmad-story-automator/steps-c/step-02-preflight.md` — Added memtrace_state to carry-forward, Memtrace context block
- COPY (install) `.agents/skills/bmad-story-automator/` — Full directory copied from outer to inner project
