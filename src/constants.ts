export const MAX_SUB_QUERY_TIMEOUT_MS = 200;
export const MAX_DISPATCH_TIMEOUT_MS = 3000;
export const PROBE_INTERVAL_MS = 15000;
export const HYSTERESIS_PROBE_COUNT = 3;
export const CLASSIFICATION_CONFIDENCE_THRESHOLD = 0.95;
export const DEDUP_CACHE_TTL_MS = 30000;
export const STATUS_REFRESH_MS = 500;

export const MIDDLEWARE_VERSION = '2.0.0';
export const COLD_START_DISPATCH_COUNT = 5;
export const COLD_START_IDLE_THRESHOLD_MS = 30000;

export const MCP_TOOL_FIND_CODE = 'memtrace_find_code';
export const MCP_TOOL_GET_SYMBOL_CONTEXT = 'memtrace_get_symbol_context';
export const MCP_TOOL_GET_IMPACT = 'memtrace_get_impact';
export const MCP_TOOL_FIND_AST_REVIEW_ISSUES = 'find_ast_review_issues';
export const MCP_TOOL_GET_STYLE_FINGERPRINT = 'get_style_fingerprint';
export const MCP_TOOL_FIND_DEAD_CODE = 'memtrace_find_dead_code';
export const MCP_TOOL_GET_EVOLUTION = 'memtrace_get_evolution';
export const MCP_TOOL_GET_PROCESS_FLOW = 'memtrace_get_process_flow';
export const MCP_TOOL_GET_API_TOPOLOGY = 'memtrace_get_api_topology';
export const MCP_TOOL_FIND_BRIDGE_SYMBOLS = 'memtrace_find_bridge_symbols';
export const MCP_TOOL_FIND_CENTRAL_SYMBOLS = 'memtrace_find_central_symbols';
export const MCP_TOOL_FIND_DEPENDENCY_PATH = 'memtrace_find_dependency_path';
