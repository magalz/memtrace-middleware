import { describe, it, expect } from 'vitest';
import { createBmadAdapter } from '../../adapters/bmad/index.js';

describe('BMad adapter', () => {
  it('[P0] implements ToolProvider dispatch method', async () => {
    const adapter = createBmadAdapter();
    const result = await adapter.dispatch({ method: 'tools/call', params: {} });
    expect(result.content).toBeDefined();
    expect(result.content[0]?.text).toBe('ok');
  });

  it('[P1] implements createSession and destroySession', () => {
    const adapter = createBmadAdapter();
    const sessionId = adapter.createSession();
    expect(sessionId).toMatch(/^bmad-sess-/);
    adapter.destroySession(sessionId);
  });

  it('[P1] getSession returns undefined for unknown session', () => {
    const adapter = createBmadAdapter();
    expect(adapter.getSession?.('nonexistent')).toBeUndefined();
  });

  it('[P2] contextBuilder builds response from FusedContext', () => {
    const adapter = createBmadAdapter();
    const response = adapter.contextBuilder.buildContext({
      blocks: [
        {
          symbol: 'foo',
          file_path: 'bar.ts',
          start_line: 1,
          end_line: 10,
          centrality: 0.5,
          query_type: 'find_code',
        },
      ],
      partial: false,
      trace_id: 'test-001',
      provenance: ['test'],
    });
    expect(response.content[0]?.text).toContain('foo');
  });
});
