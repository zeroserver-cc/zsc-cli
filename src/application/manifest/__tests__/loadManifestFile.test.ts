import fs from 'fs';
import os from 'os';
import path from 'path';
import { loadManifestFile } from '../loadManifestFile';
import { ManifestError } from '../parseManifest';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'zs-manifest-'));
}

describe('loadManifestFile', () => {
  it('loads and parses zs.yaml from a directory', () => {
    const dir = tmpDir();
    fs.writeFileSync(
      path.join(dir, 'zs.yaml'),
      'app: demo\nservices:\n  - name: web\n    image: nginx\n    exposed: true\n',
    );
    const m = loadManifestFile(dir);
    expect(m.app).toBe('demo');
    expect(m.services[0].image).toBe('nginx');
  });

  it('also accepts zs.yml', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'zs.yml'), 'app: demo\nservices:\n  - name: web\n    image: nginx\n');
    expect(loadManifestFile(dir).app).toBe('demo');
  });

  it('throws a clear error when no manifest is present', () => {
    const dir = tmpDir();
    expect(() => loadManifestFile(dir)).toThrow(ManifestError);
    expect(() => loadManifestFile(dir)).toThrow(/No zs.yaml found/);
  });
});
