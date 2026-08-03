import fs from 'fs';
import path from 'path';
import { AppManifest } from '../../domain/entities/types';
import { parseManifest, ManifestError } from './parseManifest';
import { applyEnvFiles } from './envFile';

export const MANIFEST_FILENAMES = ['zs.yaml', 'zs.yml'];

/**
 * Find and parse the zs.yaml in `dir` (defaults to the current directory).
 * Service envFile(s) are loaded and merged into env here, relative to the
 * manifest directory; problems (missing file, malformed line) are reported
 * through `onWarning` and never fail the load.
 * Throws ManifestError with a clear message when no manifest is present.
 */
export function loadManifestFile(dir: string = process.cwd(), onWarning?: (message: string) => void): AppManifest {
  for (const name of MANIFEST_FILENAMES) {
    const filePath = path.join(dir, name);
    if (fs.existsSync(filePath)) {
      const manifest = parseManifest(fs.readFileSync(filePath, 'utf-8'));
      const { services, warnings } = applyEnvFiles(manifest.services, path.dirname(filePath));
      warnings.forEach((warning) => onWarning?.(warning));
      return { ...manifest, services };
    }
  }
  throw new ManifestError(
    `No zs.yaml found in ${dir}. Create one (see the deploy guide) or run "zs deploy <image>" for a single container.`,
  );
}
