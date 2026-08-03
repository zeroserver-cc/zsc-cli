import fs from 'fs';
import os from 'os';
import path from 'path';
import { parseEnvFile, applyEnvFiles } from '../envFile';
import { ManifestService } from '../../../domain/entities/types';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'zs-envfile-'));
}

function service(partial: Partial<ManifestService>): ManifestService {
  return { name: 'api', image: 'img:1.0', ...partial };
}

describe('parseEnvFile', () => {
  it('parses KEY=VALUE lines, ignoring blanks and comments', () => {
    const { vars, malformedLines } = parseEnvFile('# comment\n\nFOO=bar\n   \nBAZ=qux\n');
    expect(vars).toEqual([
      ['FOO', 'bar'],
      ['BAZ', 'qux'],
    ]);
    expect(malformedLines).toEqual([]);
  });

  it('does not treat inline # as a comment', () => {
    const { vars } = parseEnvFile('A=value#with-hash\n');
    expect(vars).toEqual([['A', 'value#with-hash']]);
  });

  it('strips matching single and double quotes around values', () => {
    const { vars } = parseEnvFile(`A="hello world"\nB='single'\nC=no-quotes\n`);
    expect(vars).toEqual([
      ['A', 'hello world'],
      ['B', 'single'],
      ['C', 'no-quotes'],
    ]);
  });

  it('keeps values with = inside and does not expand variables', () => {
    const { vars } = parseEnvFile('URL=postgres://u:p@db:5432/app?ssl=$SSL_MODE\n');
    expect(vars).toEqual([['URL', 'postgres://u:p@db:5432/app?ssl=$SSL_MODE']]);
  });

  it('reports lines without KEY=VALUE as malformed (including export lines)', () => {
    const { vars, malformedLines } = parseEnvFile('GOOD=1\nno-equals-here\nexport EXPORTED=2\n=novalue\n');
    expect(vars).toEqual([['GOOD', '1']]);
    expect(malformedLines).toEqual([2, 3, 4]);
  });
});

describe('applyEnvFiles', () => {
  it('merges a single envFile (string form) into the service env', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, '.env'), 'FOO=from-file\nBAR=file\n');

    const { services, warnings } = applyEnvFiles([service({ envFile: '.env' })], dir);

    expect(services[0].env).toEqual(['FOO=from-file', 'BAR=file']);
    expect(services[0]).not.toHaveProperty('envFile');
    expect(warnings).toEqual([]);
  });

  it('merges a list of envFiles, the last one overriding earlier ones', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, '.env'), 'A=base\nB=base\n');
    fs.writeFileSync(path.join(dir, '.env.local'), 'B=local\nC=local\n');

    const { services } = applyEnvFiles([service({ envFile: ['.env', '.env.local'] })], dir);

    expect(services[0].env).toEqual(['A=base', 'B=local', 'C=local']);
  });

  it('lets zs.yaml env entries override envFile values for the same key', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, '.env'), 'OVERRIDE=file\nKEEP=file\n');

    const { services } = applyEnvFiles([service({ envFile: '.env', env: ['OVERRIDE=1'] })], dir);

    expect(services[0].env).toEqual(['OVERRIDE=1', 'KEEP=file']);
  });

  it('warns and continues when an envFile is missing', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, '.env'), 'A=1\n');

    const { services, warnings } = applyEnvFiles([service({ envFile: ['.env', '.env.local'] })], dir);

    expect(services[0].env).toEqual(['A=1']);
    expect(warnings).toEqual(["zs.yaml: envFile '.env.local' not found for service 'api'; skipping"]);
  });

  it('warns about malformed lines and still loads the valid ones', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, '.env'), 'GOOD=1\nbroken-line\n');

    const { services, warnings } = applyEnvFiles([service({ envFile: '.env' })], dir);

    expect(services[0].env).toEqual(['GOOD=1']);
    expect(warnings).toEqual(["zs.yaml: envFile '.env' for service 'api': line 2 ignored (expected KEY=VALUE)"]);
  });

  it('resolves relative paths from the manifest directory, not the cwd', () => {
    const dir = tmpDir();
    const otherCwd = tmpDir();
    fs.writeFileSync(path.join(dir, '.env'), 'FROM_MANIFEST_DIR=1\n');
    // A decoy with the same name in the cwd must not be picked up.
    fs.writeFileSync(path.join(otherCwd, '.env'), 'FROM_CWD=1\n');

    const previousCwd = process.cwd();
    process.chdir(otherCwd);
    try {
      const { services } = applyEnvFiles([service({ envFile: '.env' })], dir);
      expect(services[0].env).toEqual(['FROM_MANIFEST_DIR=1']);
    } finally {
      process.chdir(previousCwd);
    }
  });

  it('leaves services without envFile untouched', () => {
    const dir = tmpDir();
    const untouched = service({ env: ['A=1'] });
    const { services, warnings } = applyEnvFiles([untouched], dir);
    expect(services[0]).toBe(untouched);
    expect(warnings).toEqual([]);
  });
});
