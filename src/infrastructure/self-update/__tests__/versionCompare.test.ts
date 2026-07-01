import { isNewerVersion } from '../versionCompare';

describe('isNewerVersion', () => {
  it('detects newer major/minor/patch', () => {
    expect(isNewerVersion('0.1.3', '0.1.2')).toBe(true);
    expect(isNewerVersion('0.2.0', '0.1.9')).toBe(true);
    expect(isNewerVersion('1.0.0', '0.9.9')).toBe(true);
  });

  it('is false for equal or older', () => {
    expect(isNewerVersion('0.1.2', '0.1.2')).toBe(false);
    expect(isNewerVersion('0.1.1', '0.1.2')).toBe(false);
  });

  it('tolerates a v prefix and ignores pre-release suffixes', () => {
    expect(isNewerVersion('v0.1.3', '0.1.2')).toBe(true);
    expect(isNewerVersion('v0.1.2', '0.1.2')).toBe(false);
    expect(isNewerVersion('v0.2.0-rc.1', '0.1.2')).toBe(true);
  });
});
