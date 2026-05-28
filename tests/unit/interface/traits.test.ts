// AC 1.4-1: Agent Interface contract — ToolProvider, ContextBuilder, Session (FR23)
// AC 1.4-8: traits test — all three traits compile with correct TypeScript signatures
import { describe, it, expect } from 'vitest';

import type {
  ToolProvider,
  ContextBuilder,
  Session,
  AgentResponse,
} from '../../../src/interface/traits.js';
import type { FusedContext, DegradationTier } from '../../../src/types.js';

describe('Agent Interface contracts', () => {
  describe('ToolProvider', () => {
    it('[P0] should accept valid ToolProvider implementation', () => {
      const provider: ToolProvider = {
        dispatch: async (_message: Record<string, unknown>): Promise<AgentResponse> => ({
          content: [{ type: 'text', text: 'result' }],
          metadata: { tier: 'full' as DegradationTier, trace_id: 'fc-12345678', elapsed_ms: 42 },
        }),
      };

      expect(typeof provider.dispatch).toBe('function');
      expect(provider).toHaveProperty('dispatch');
    });

    it('[P0] should allow ToolProvider without optional metadata', () => {
      const provider: ToolProvider = {
        dispatch: async () => ({
          content: [{ type: 'text', text: 'result' }],
        }),
      };

      expect(typeof provider.dispatch).toBe('function');
    });
  });

  describe('ContextBuilder', () => {
    it('[P0] should accept valid ContextBuilder implementation', () => {
      const builder: ContextBuilder = {
        buildContext(_context: FusedContext): AgentResponse {
          return {
            content: [{ type: 'text', text: JSON.stringify(_context.blocks) }],
            metadata: {
              tier: _context.partial ? 'intent_reduced' : 'full',
              trace_id: _context.trace_id,
              elapsed_ms: 0,
            },
          };
        },
      };

      const fc: FusedContext = {
        blocks: [
          {
            symbol: 'auth',
            file_path: 'src/auth.ts',
            start_line: 1,
            end_line: 10,
            centrality: 0.9,
            query_type: 'find_code',
          },
        ],
        partial: false,
        trace_id: 'fc-12345678',
        provenance: [],
      };

      const result = builder.buildContext(fc);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
    });
  });

  describe('Session', () => {
    it('[P0] should accept valid Session implementation', () => {
      const sessions = new Map<string, { createdAt: string; intentCount: number }>();

      const session: Session = {
        createSession(): string {
          const id = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          sessions.set(id, { createdAt: new Date().toISOString(), intentCount: 0 });
          return id;
        },
        destroySession(id: string): void {
          sessions.delete(id);
        },
      };

      const id = session.createSession();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);

      session.destroySession(id);
    });
  });
});
