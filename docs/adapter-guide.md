# Adapter Guide

Build a custom adapter for any AI agent framework in 5 steps.

## Step 1 — Zero-Setup Scaffold

```bash
git clone https://github.com/your-org/memtrace-middleware
cd memtrace-middleware
pnpm install
```

See the example adapter in `examples/` for a working reference.

## Step 2 — Trait Walkthrough

The Agent Interface defines three traits in `src/interface/traits.ts`:

### ToolProvider

```typescript
export interface ToolProvider {
  dispatch(message: Record<string, unknown>): Promise<AgentResponse>;
}
```

Maps agent tool calls to middleware intent dispatch.

### ContextBuilder

```typescript
export interface ContextBuilder {
  buildContext(context: FusedContext): AgentResponse;
}
```

Formats fused graph results into your framework's response format.

### Session

```typescript
export interface Session {
  createSession(): string;
  destroySession(id: string): void;
  getSession?(id: string): SessionState | undefined;
}
```

Manages conversation state across dispatches.

## Step 3 — Mapping Your Framework

Hook your agent's tool-call lifecycle into the middleware:

```typescript
import { BaseAdapter } from '@memtrace/middleware';

const adapter = new BaseAdapter(backend);
const response = await adapter.dispatch(toolCallMessage);
```

≤15 lines of hook code.

## Step 4 — Testing

```bash
pnpm test
```

Runs the full integration suite against a mock Memtrace backend.

## Step 5 — Debugging

```bash
MEMTRACE_DEBUG=1 pnpm start
```

Enables verbose logging. Error envelopes include cause codes and suggested actions.
