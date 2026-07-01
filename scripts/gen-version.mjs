// Regenerates src/version.ts from package.json so the CLI's `--version` can never
// drift from the package version (the root cause of the 0.1.0/0.1.1 mismatch).
// Run automatically by `build:bundle`, so every release bundles the real version.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const contents = `// Generated from package.json by scripts/gen-version.mjs — do not edit by hand.
export const VERSION = '${version}';
`;
writeFileSync(join(root, 'src', 'version.ts'), contents);
console.log(`version.ts -> ${version}`);
