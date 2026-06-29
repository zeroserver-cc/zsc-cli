import fs from 'fs';
import path from 'path';
import { AppManifest } from '../../domain/entities/types';
import { parseManifest, ManifestError } from './parseManifest';

export const MANIFEST_FILENAMES = ['zs.yaml', 'zs.yml'];

/**
 * Find and parse the zs.yaml in `dir` (defaults to the current directory).
 * Throws ManifestError with a clear message when no manifest is present.
 */
export function loadManifestFile(dir: string = process.cwd()): AppManifest {
  for (const name of MANIFEST_FILENAMES) {
    const filePath = path.join(dir, name);
    if (fs.existsSync(filePath)) {
      return parseManifest(fs.readFileSync(filePath, 'utf-8'));
    }
  }
  throw new ManifestError(
    `No zs.yaml found in ${dir}. Create one (see the deploy guide) or run "zs deploy <image>" for a single container.`,
  );
}
