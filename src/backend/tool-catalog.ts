import type { MemtraceCapabilities, ToolSchema } from '../types.js';

export class ToolCatalog {
  private tools: Map<string, ToolSchema> = new Map();

  getCapabilities(): MemtraceCapabilities {
    return { tools: Array.from(this.tools.values()) };
  }

  getTool(name: string): ToolSchema | undefined {
    return this.tools.get(name);
  }

  refresh(tools: ToolSchema[]): void {
    this.tools.clear();
    for (const tool of tools) {
      if (tool.name) {
        this.tools.set(tool.name, tool);
      }
    }
  }

  onToolsChanged(notification: { added?: ToolSchema[]; removed?: string[] }): void {
    if (notification.added) {
      for (const tool of notification.added) {
        if (tool.name) {
          this.tools.set(tool.name, tool);
        }
      }
    }
    if (notification.removed) {
      for (const name of notification.removed) {
        this.tools.delete(name);
      }
    }
  }
}
