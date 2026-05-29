export interface DispatchContext {
  traceId: string;
  dispatchStart: number;
  activeTimers: Set<NodeJS.Timeout>;
  activeControllers: Set<AbortController>;
  errors: string[];
  hasDegraded: boolean;
}

export function createDispatchContext(traceId: string): DispatchContext {
  return {
    traceId,
    dispatchStart: Date.now(),
    activeTimers: new Set(),
    activeControllers: new Set(),
    errors: [],
    hasDegraded: false,
  };
}

export function cleanupContext(ctx: DispatchContext): void {
  for (const timer of ctx.activeTimers) {
    clearTimeout(timer);
  }
  ctx.activeTimers.clear();
  for (const controller of ctx.activeControllers) {
    controller.abort();
  }
  ctx.activeControllers.clear();
}
