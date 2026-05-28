let currentFloor: string | undefined;

export function getFloorOverride(): string | undefined {
  return currentFloor;
}

export function onConfigChanged(delta: Record<string, unknown>): void {
  if ('degradation_floor' in delta) {
    currentFloor = delta['degradation_floor'] as string;
  }
}
