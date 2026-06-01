# Changelog

## [1.0.0] — 2026-06-01

### Core Pipeline (Epic 1)

- **Agent Interface**: `ToolProvider`, `ContextBuilder`, `Session` traits for framework-agnostic integration.
- **Intent Router**: Keyword-based classification with plugin contract for `find_code`, `get_symbol_context`, `get_impact` (>=95% accuracy, confidence threshold 0.95).
- **Query Decomposition**: `plan()` decomposes classified intents into parallel Memtrace graph queries with per-query `AbortController` (200ms deadline).
- **MemtraceBackend**: MCP JSON-RPC 2.0 transport, runtime `tools/list` discovery, credential isolation, reconnection with exponential backoff.
- **Configuration**: File/env/CLI precedence, hot-reload via filesystem watcher (chokidar).
- **Zero-config**: Auto-detect project structure, Memtrace index, workspace anchor.
- **CLI Adapter**: Factory implementing Agent Interface (~50 lines), Zod input validation at adapter boundary.

### Fusion & Visibility (Epic 2)

- **Fusion Engine**: Deduplication, centrality ranking (PageRank), file-path + line-number provenance annotations (`[memtrace: grounded via ...]`).
- **Context Injection**: `FusedContext` injected before LLM response generation.
- **Schema Validation**: All emitted code references validated — fabricated claims rejected.
- **Cross-Intent Isolation**: Fresh execution context per dispatch, no state contamination between sequential or concurrent dispatches.
- **CLI Status**: Live-updating terminal display (500ms refresh, `\r` overwrite), color-coded health dot, degradation tier, active intents.

### Resilience (Epic 3)

- **4-Tier Degradation**: Full → Intent-reduced → Passthrough → Fail-closed with 3-probe hysteresis (flapping prevention).
- **Auto-Recovery**: 3 consecutive successful probes restore Full tier; configurable floor tier prevents silent upgrades.
- **Error Taxonomy**: `MiddlewareError` with `cause`, `recoverable`, `suggested_action`, `trace_id` — type preserved across all layers.
- **Fail-Closed Safety**: Structured error returned when Memtrace unavailable, enabling agent retry/fallback decisions.

### Inter-Epic: MCPClient Refactor & Hermetic Testing

- **MCPClient Refactor**: Backend decoupled from transport for testability.
- **Hermetic MCP Mocking**: In-memory mock server replaces live Memtrace in CI/CD — test suite completes in ~13s.
- **QA Hardening**: 6 bug fixes in adapter and QA scripts.

### Telemetry & CI (Epic 4)

- **Structured Telemetry**: NDJSON to stderr with `{intent_type_short}-{uuid8}` trace IDs and ISO-8601 phase timestamps.
- **Cold-Start Tracking**: First 5 dispatches + idle timer — metrics tagged separately from steady-state.
- **CI/CD Pipeline**: Lint → typecheck → test → backward-compat gate → contract canary → build.
- **Contract Canary**: 5+ metric scenarios detect behavioral drift in legacy intents before merge.
- **BMad Adapter**: Test harness with zero product import chain validating framework-agnostic claims.
- **k6 Load Testing**: Ring-buffer stress test (100k ops/s, p95 < 1ms).

### Memtrace v0.5.x Intent Bridge (Epic Post)

- **New Intent: `review_code`**: Classifies AST review requests, plans `find_ast_review_issues` queries.
- **New Intent: `get_style_fingerprint`**: Classifies style-inquiry intents, plans `get_style_fingerprint` queries.
- **Backward Compat**: v0.4.x servers gracefully passthrough unknown tools; 3 MVP intents unchanged.

### Documentation

- `README.md`: Zero-config install, architecture diagram (Mermaid), status panel preview, troubleshooting FAQ.
- `CONTRIBUTING.md`: Setup, test commands, PR checklist, branch naming, Conventional Commits.
- `docs/adapter-guide.md`: 5-step integration guide for custom adapter authors.
