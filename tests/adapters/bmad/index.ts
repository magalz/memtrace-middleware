import type {
  AgentResponse,
  ContextBuilder,
  ToolProvider,
  Session,
} from '../../../src/interface/traits.js';
import { DegradationTier } from '../../../src/types.js';
import type { FusedContext } from '../../../src/types.js';

export function createBmadAdapter(): ToolProvider & Session & { contextBuilder: ContextBuilder } {
  const sessions = new Map<string, { id: string; created_at: string; intent_count: number }>();

  const contextBuilder: ContextBuilder = {
    buildContext(context: FusedContext): AgentResponse {
      const textBlocks = context.blocks.map(
        (b) => `[bmad: ${b.symbol} at ${b.file_path}:${b.start_line}]`
      );
      return {
        content: [{ type: 'text', text: textBlocks.join('\n') || 'no results' }],
        metadata: {
          tier: context.partial ? DegradationTier.IntentReduced : DegradationTier.Full,
          trace_id: context.trace_id,
          elapsed_ms: 0,
        },
      };
    },
  };

  return {
    dispatch: async (_message: Record<string, unknown>): Promise<AgentResponse> => {
      return { content: [{ type: 'text', text: 'ok' }] };
    },
    createSession: (): string => {
      const id = `bmad-sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      sessions.set(id, { id, created_at: new Date().toISOString(), intent_count: 0 });
      return id;
    },
    destroySession: (id: string): void => {
      sessions.delete(id);
    },
    getSession: (id: string) => {
      return sessions.get(id);
    },
    contextBuilder,
  };
}
