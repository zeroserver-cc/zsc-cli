// Compact rendering of a node's shared resource limits, e.g.
// "2 vCPU / 4096 MB / 51200 MB", or "—" when no limit is set.
export interface SharedLimitsLike {
  sharedVCpu?: number | null;
  sharedMemoryMb?: number | null;
  sharedStorageMb?: number | null;
}

export function formatSharedLimits(machine: SharedLimitsLike): string {
  const parts = [
    machine.sharedVCpu != null ? `${machine.sharedVCpu} vCPU` : null,
    machine.sharedMemoryMb != null ? `${machine.sharedMemoryMb} MB` : null,
    machine.sharedStorageMb != null ? `${machine.sharedStorageMb} MB` : null,
  ].filter((part): part is string => part !== null);
  return parts.length ? parts.join(' / ') : '—';
}

export function formatSharedLimitValue(value: number | null | undefined, unit: string): string {
  return value != null ? `${value} ${unit}` : 'no limit';
}
