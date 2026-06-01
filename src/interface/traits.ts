import type { DegradationTier, FusedContext } from '../types.js';

export interface AgentResponse {
  content: Array<{ type: 'text'; text: string }>;
  metadata?: {
    tier: DegradationTier;
    trace_id: string;
    elapsed_ms: number;
    passthrough?: boolean;
    degradation_tier?: DegradationTier;
    tier_transition?: {
      reason: string;
      from: DegradationTier;
      to: DegradationTier;
      timestamp: string;
    };
    startup_type?: 'cold' | 'warm';
  };
}

export interface ToolProvider {
  dispatch(message: Record<string, unknown>): Promise<AgentResponse>;
}

export interface ContextBuilder {
  buildContext(context: FusedContext): AgentResponse;
}

export interface SessionState {
  id: string;
  created_at: string;
  intent_count: number;
}

export interface Session {
  createSession(): string;
  destroySession(id: string): void;
  getSession?(id: string): SessionState | undefined;
}
