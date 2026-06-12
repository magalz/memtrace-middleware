import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { metrics } from '../../src/telemetry/metrics.js';
import { saveBaseline, loadBaseline } from '../../src/telemetry/baseline.js';
import { startDashboard } from '../../src/cli/dashboard.js';

describe('Dashboard — Integration', () => {
  let originalIsTTY: boolean | undefined;

  beforeEach(() => {
    metrics.reset();
    originalIsTTY = process.stdout.isTTY;
    process.stdout.isTTY = true;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.stdout.isTTY = originalIsTTY;
  });

  it('[P1] startDashboard renders something on interval tick (non-TTY path is tested in unit)', () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const controller = startDashboard();
    expect(writeSpy).toHaveBeenCalled();
    controller.stop();
  });

  it('[P1] baseline roundtrip — saveBaseline then loadBaseline returns valid data', () => {
    metrics.recordDispatch(true, 'find_code', 0.95, 100, 'warm');
    saveBaseline();
    const loaded = loadBaseline();
    expect(loaded).not.toBeNull();
    expect(loaded!.schema_version).toBe('1.0');
    expect(loaded!.query_success_rate['find_code']).toBeDefined();
  });

  it('[P1] dashboard controller stop is idempotent', () => {
    const controller = startDashboard();
    expect(() => {
      controller.stop();
      controller.stop();
    }).not.toThrow();
  });

  it('[P1] non-TTY dashboard emits compact JSON and returns immediately', () => {
    process.stdout.isTTY = false;
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const controller = startDashboard();
    expect(writeSpy).toHaveBeenCalledOnce();
    const output = writeSpy.mock.calls[0]![0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.status).toBeDefined();
    expect(parsed.tier).toBeDefined();
    expect(parsed.version).toBeDefined();
    controller.stop();
  });
});
