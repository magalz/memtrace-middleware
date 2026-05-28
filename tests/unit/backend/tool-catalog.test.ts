// AC 1.2-2: ToolCatalog caches tools from tools/list, supports tools/list_changed notifications
// (Autonomous addition — not in story ACs, added by TEA post-review)
import { describe, it, expect } from 'vitest';

import { ToolCatalog } from '../../../src/backend/tool-catalog.js';

describe('ToolCatalog', () => {
  // AC 1.2-2 — empty on creation
  it('[P1] returns empty capabilities on creation', () => {
    // Given: a freshly instantiated ToolCatalog
    const catalog = new ToolCatalog();
    // Then: getCapabilities returns an empty tools array
    expect(catalog.getCapabilities().tools).toHaveLength(0);
  });

  // AC 1.2-2 — refresh() populates the catalog from tools/list
  it('[P1] populates tools via refresh from tools/list response', () => {
    // Given: a catalog and a list of tools
    const catalog = new ToolCatalog();
    const tools = [
      { name: 'memtrace_find_code', description: 'Find code', inputSchema: {} },
      { name: 'memtrace_get_impact', description: 'Impact analysis', inputSchema: {} },
    ];
    // When: refresh is called
    catalog.refresh(tools);
    // Then: the catalog contains exactly those tools
    const capabilities = catalog.getCapabilities();
    expect(capabilities.tools).toHaveLength(2);
  });

  // AC 1.2-2 — getTool by name
  it('[P1] finds tool by name via getTool', () => {
    // Given: a catalog populated with find_code
    const catalog = new ToolCatalog();
    catalog.refresh([{ name: 'memtrace_find_code', description: 'Find code', inputSchema: {} }]);
    // When: getTool is called with the tool name
    const tool = catalog.getTool('memtrace_find_code');
    // Then: the tool is returned with the correct name
    expect(tool).toBeDefined();
    expect(tool!.name).toBe('memtrace_find_code');
  });

  // AC 1.2-2 — missing tool returns undefined
  it('[P2] returns undefined for tools not in the catalog', () => {
    // Given: a catalog with only find_code
    const catalog = new ToolCatalog();
    catalog.refresh([{ name: 'memtrace_find_code', description: 'Find code', inputSchema: {} }]);
    // When: getTool is called with a nonexistent tool
    const tool = catalog.getTool('nonexistent');
    // Then: undefined is returned
    expect(tool).toBeUndefined();
  });

  // AC 1.2-2 — second refresh replaces all tools (full reset)
  it('[P1] overwrites all tools on second refresh', () => {
    // Given: a catalog initially populated with find_code
    const catalog = new ToolCatalog();
    catalog.refresh([{ name: 'memtrace_find_code', description: 'Find code', inputSchema: {} }]);
    // When: refresh is called again with get_symbol_context
    catalog.refresh([
      { name: 'memtrace_get_symbol_context', description: 'Symbol context', inputSchema: {} },
    ]);
    // Then: only the new tool is present; old tools are cleared
    expect(catalog.getCapabilities().tools).toHaveLength(1);
    expect(catalog.getTool('memtrace_find_code')).toBeUndefined();
    expect(catalog.getTool('memtrace_get_symbol_context')).toBeDefined();
  });

  // AC 1.2-2 — tools/list_changed notification: add + remove
  it('[P1] adds and removes tools via onToolsChanged notification', () => {
    // Given: a catalog with find_code
    const catalog = new ToolCatalog();
    catalog.refresh([{ name: 'memtrace_find_code', description: 'Find code', inputSchema: {} }]);
    // When: onToolsChanged adds get_impact and removes find_code
    catalog.onToolsChanged({
      added: [{ name: 'memtrace_get_impact', description: 'Impact', inputSchema: {} }],
      removed: ['memtrace_find_code'],
    });
    // Then: only get_impact remains, find_code is removed
    expect(catalog.getCapabilities().tools).toHaveLength(1);
    expect(catalog.getTool('memtrace_get_impact')).toBeDefined();
    expect(catalog.getTool('memtrace_find_code')).toBeUndefined();
  });

  // AC 1.2-2 — null name guard: entries with empty/missing names are skipped
  it('[P2] skips tools with empty or missing names during refresh', () => {
    // Given: a tool list containing valid, empty-name, and no-name entries
    const catalog = new ToolCatalog();
    catalog.refresh([
      { name: 'valid_tool', description: 'Valid', inputSchema: {} },
      { name: '', description: 'Empty name', inputSchema: {} },
      { description: 'No name', inputSchema: {} } as unknown as {
        name: string;
        description: string;
        inputSchema: Record<string, unknown>;
      },
    ]);
    // Then: only the valid tool is stored
    expect(catalog.getCapabilities().tools).toHaveLength(1);
    expect(catalog.getTool('valid_tool')).toBeDefined();
  });
});
