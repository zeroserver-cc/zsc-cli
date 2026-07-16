import { formatSharedLimits, formatSharedLimitValue } from '../sharedLimits';

describe('formatSharedLimits', () => {
  it('renders all three limits joined by slashes', () => {
    expect(
      formatSharedLimits({ sharedVCpu: 2, sharedMemoryMb: 4096, sharedStorageMb: 51200 }),
    ).toBe('2 vCPU / 4096 MB / 51200 MB');
  });

  it('renders only the limits that are set', () => {
    expect(formatSharedLimits({ sharedMemoryMb: 4096 })).toBe('4096 MB');
    expect(formatSharedLimits({ sharedVCpu: 2.5, sharedMemoryMb: null, sharedStorageMb: 1024 })).toBe(
      '2.5 vCPU / 1024 MB',
    );
  });

  it('renders a dash when no limit is set', () => {
    expect(formatSharedLimits({})).toBe('—');
    expect(formatSharedLimits({ sharedVCpu: null, sharedMemoryMb: null, sharedStorageMb: null })).toBe('—');
  });
});

describe('formatSharedLimitValue', () => {
  it('renders the value with its unit', () => {
    expect(formatSharedLimitValue(4096, 'MB')).toBe('4096 MB');
  });

  it('renders "no limit" for null or undefined', () => {
    expect(formatSharedLimitValue(null, 'MB')).toBe('no limit');
    expect(formatSharedLimitValue(undefined, 'MB')).toBe('no limit');
  });
});
