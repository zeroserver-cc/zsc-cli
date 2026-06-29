import { program } from '../index';

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
  });

  it('has correct version', () => {
    expect(program.version()).toBe('0.1.0');
  });

  it('has correct binary name', () => {
    expect(program.name()).toBe('zs');
  });
});
