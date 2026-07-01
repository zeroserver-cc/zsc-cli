import { program } from '../index';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkg = require('../../package.json') as { version: string };

describe('CLI smoke test', () => {
  it('registers all required commands', () => {
    const names = program.commands.map((c) => c.name());
    expect(names).toContain('login');
    expect(names).toContain('logout');
    expect(names).toContain('whoami');
    expect(names).toContain('config');
    // developer commands
    expect(names).toContain('deploy');
    expect(names).toContain('list');
    expect(names).toContain('logs');
    expect(names).toContain('stop');
    expect(names).toContain('remove');
    // provider commands
    expect(names).toContain('node');
    expect(names).toContain('nodes');
    // registry credentials (private images)
    expect(names).toContain('registry');
  });

  // Asserts the CLI version (from the generated src/version.ts) matches
  // package.json, so a stale version.ts or a forgotten `gen:version` fails CI.
  it('reports the package.json version', () => {
    expect(program.version()).toBe(pkg.version);
  });

  it('has correct binary name', () => {
    expect(program.name()).toBe('zs');
  });
});
