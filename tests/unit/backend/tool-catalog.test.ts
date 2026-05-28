import { describe, it, expect } from 'vitest';

import { ToolCatalog } from '../../../src/backend/tool-catalog.js';

describe('ToolCatalog', () => {
  it('should be empty on creation', () => {
    const catalog = new ToolCatalog();
    expect(catalog.getCapabilities().tools).toHaveLength(0);
  });

  it('should populate tools via refresh', () => {
    const catalog = new ToolCatalog();
    const tools = [
      { name: 'memtrace_find_code', description: 'Find code', inputSchema: {} },
      { name: 'memtrace_get_impact', description: 'Impact analysis', inputSchema: {} },
    ];

    catalog.refresh(tools);

    const capabilities = catalog.getCapabilities();
    expect(capabilities.tools).toHaveLength(2);
  });

  it('should find tool by name', () => {
    const catalog = new ToolCatalog();
    catalog.refresh([{ name: 'memtrace_find_code', description: 'Find code', inputSchema: {} }]);

    const tool = catalog.getTool('memtrace_find_code');
    expect(tool).toBeDefined();
    expect(tool!.name).toBe('memtrace_find_code');
  });

  it('should return undefined for missing tool', () => {
    const catalog = new ToolCatalog();
    catalog.refresh([{ name: 'memtrace_find_code', description: 'Find code', inputSchema: {} }]);

    const tool = catalog.getTool('nonexistent');
    expect(tool).toBeUndefined();
  });

  it('should overwrite tools on second refresh', () => {
    const catalog = new ToolCatalog();
    catalog.refresh([{ name: 'memtrace_find_code', description: 'Find code', inputSchema: {} }]);
    catalog.refresh([
      { name: 'memtrace_get_symbol_context', description: 'Symbol context', inputSchema: {} },
    ]);

    expect(catalog.getCapabilities().tools).toHaveLength(1);
    expect(catalog.getTool('memtrace_find_code')).toBeUndefined();
    expect(catalog.getTool('memtrace_get_symbol_context')).toBeDefined();
  });

  it('should add and remove via onToolsChanged', () => {
    const catalog = new ToolCatalog();
    catalog.refresh([{ name: 'memtrace_find_code', description: 'Find code', inputSchema: {} }]);

    catalog.onToolsChanged({
      added: [{ name: 'memtrace_get_impact', description: 'Impact', inputSchema: {} }],
      removed: ['memtrace_find_code'],
    });

    expect(catalog.getCapabilities().tools).toHaveLength(1);
    expect(catalog.getTool('memtrace_get_impact')).toBeDefined();
    expect(catalog.getTool('memtrace_find_code')).toBeUndefined();
  });

  it('should skip tools with missing names', () => {
    const catalog = new ToolCatalog();
    catalog.refresh([
      { name: 'valid_tool', description: 'Valid', inputSchema: {} },
      { name: '', description: 'Empty name', inputSchema: {} },
      // name is optional in ToolSchema type — simulate missing
      { description: 'No name', inputSchema: {} } as unknown as {
        name: string;
        description: string;
        inputSchema: Record<string, unknown>;
      },
    ]);

    expect(catalog.getCapabilities().tools).toHaveLength(1);
    expect(catalog.getTool('valid_tool')).toBeDefined();
  });
});
