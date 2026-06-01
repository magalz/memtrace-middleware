import type { MemtraceBackend } from '../../backend/trait.js';
import type { MiddlewareConfig } from '../../config/index.js';
import { BaseAdapter } from '../../interface/base-adapter.js';
import type { ToolProvider } from '../../interface/traits.js';

export function createCliAdapter(
  backend: MemtraceBackend,
  config?: MiddlewareConfig
): ToolProvider {
  return new BaseAdapter(backend, config);
}
