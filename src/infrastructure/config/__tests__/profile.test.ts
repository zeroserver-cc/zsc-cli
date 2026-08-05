import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

jest.mock('os', () => ({
  ...jest.requireActual('os'),
  homedir: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { homedir } = require('os') as { homedir: jest.Mock };

import {
  assertValidProfileName,
  DEFAULT_PROFILE,
  describeProfileSource,
  resolveActiveProfile,
  setProfileFlag,
} from '../profile';

let home: string;
let cwd: string;

function writeGlobalConfig(data: Record<string, unknown>): void {
  const dir = join(home, '.config', 'zsc');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'config.json'), JSON.stringify(data));
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'zsc-profile-home-'));
  cwd = mkdtempSync(join(tmpdir(), 'zsc-profile-cwd-'));
  homedir.mockReturnValue(home);
  setProfileFlag(undefined);
  delete process.env.ZS_PROFILE;
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  rmSync(cwd, { recursive: true, force: true });
  setProfileFlag(undefined);
  delete process.env.ZS_PROFILE;
});

describe('resolveActiveProfile precedence', () => {
  it('falls back to the default profile when nothing selects one', () => {
    expect(resolveActiveProfile(cwd)).toEqual({ name: DEFAULT_PROFILE, source: 'default' });
  });

  it('uses the global activeProfile from config.json', () => {
    writeGlobalConfig({ backendUrl: 'https://api.zeroserver.cc', activeProfile: 'work' });

    expect(resolveActiveProfile(cwd)).toEqual({ name: 'work', source: 'global' });
  });

  it('lets zs.toml override the global activeProfile', () => {
    writeGlobalConfig({ activeProfile: 'work' });
    writeFileSync(join(cwd, 'zs.toml'), 'session = "cliente-x"\n');

    expect(resolveActiveProfile(cwd)).toEqual({ name: 'cliente-x', source: 'zs.toml' });
  });

  it('lets ZS_PROFILE override zs.toml', () => {
    writeFileSync(join(cwd, 'zs.toml'), 'session = "cliente-x"\n');
    process.env.ZS_PROFILE = 'ci';

    expect(resolveActiveProfile(cwd)).toEqual({ name: 'ci', source: 'env' });
  });

  it('lets the --profile flag override everything', () => {
    writeFileSync(join(cwd, 'zs.toml'), 'session = "cliente-x"\n');
    process.env.ZS_PROFILE = 'ci';
    setProfileFlag('adhoc');

    expect(resolveActiveProfile(cwd)).toEqual({ name: 'adhoc', source: 'flag' });
  });

  it('rejects a global activeProfile that would escape the sessions directory', () => {
    writeGlobalConfig({ backendUrl: 'https://api.zeroserver.cc', activeProfile: '../../escape' });

    expect(() => resolveActiveProfile(cwd)).toThrow(/not a valid profile name/);
    expect(() => resolveActiveProfile(cwd)).toThrow(/zs session use default/);
  });

  it('still falls back to default when config.json is corrupted JSON', () => {
    const dir = join(home, '.config', 'zsc');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'config.json'), '{"activeProfile": "work"###');

    expect(resolveActiveProfile(cwd)).toEqual({ name: DEFAULT_PROFILE, source: 'default' });
  });
});

describe('zs.toml parsing', () => {
  it('ignores a zs.toml without a session field', () => {
    writeFileSync(join(cwd, 'zs.toml'), '[placement]\ncountry = "br"\n');

    expect(resolveActiveProfile(cwd)).toEqual({ name: DEFAULT_PROFILE, source: 'default' });
  });

  it('fails loudly on a malformed zs.toml instead of picking the wrong account', () => {
    writeFileSync(join(cwd, 'zs.toml'), 'session = "unterminated\n');

    expect(() => resolveActiveProfile(cwd)).toThrow(/Could not parse .*zs\.toml/);
  });

  it('rejects a non-string session field', () => {
    writeFileSync(join(cwd, 'zs.toml'), 'session = 42\n');

    expect(() => resolveActiveProfile(cwd)).toThrow(/expected a string/);
  });

  it('rejects a session value that is not a valid profile name', () => {
    writeFileSync(join(cwd, 'zs.toml'), 'session = "../escape"\n');

    expect(() => resolveActiveProfile(cwd)).toThrow(/not a valid profile name/);
  });
});

describe('profile name validation', () => {
  it.each(['default', 'cliente-x', 'work_2', 'a.b', 'UPPER'])('accepts %s', (name) => {
    expect(() => assertValidProfileName(name)).not.toThrow();
  });

  it.each(['../escape', 'a/b', 'a b', '', '-leading-dash', '.leading-dot'])(
    'rejects %s',
    (name) => {
      expect(() => assertValidProfileName(name)).toThrow(/Invalid profile name/);
    },
  );

  it('rejects names that would overflow the filesystem filename limit', () => {
    expect(() => assertValidProfileName('a'.repeat(65))).toThrow(/too long/);
    expect(() => assertValidProfileName('a'.repeat(64))).not.toThrow();
  });

  it('rejects path traversal through ZS_PROFILE', () => {
    process.env.ZS_PROFILE = '../other';

    expect(() => resolveActiveProfile(cwd)).toThrow(/Invalid profile name/);
  });

  it('rejects an invalid --profile flag value at set time', () => {
    expect(() => setProfileFlag('a/b')).toThrow(/Invalid profile name/);
  });
});

describe('describeProfileSource', () => {
  it('labels every source', () => {
    expect(describeProfileSource('flag')).toContain('--profile');
    expect(describeProfileSource('env')).toContain('ZS_PROFILE');
    expect(describeProfileSource('zs.toml')).toBe('zs.toml');
    expect(describeProfileSource('global')).toContain('session use');
    expect(describeProfileSource('default')).toBe('default');
  });
});
