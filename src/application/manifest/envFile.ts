import fs from 'fs';
import path from 'path';
import { ManifestService } from '../../domain/entities/types';

const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export interface EnvFileParseResult {
  /** KEY=VALUE entries in file order; later duplicates of a key override earlier ones. */
  vars: [string, string][];
  /** 1-based line numbers skipped because they are not KEY=VALUE lines. */
  malformedLines: number[];
}

/**
 * Parse a .env file body. Supports KEY=VALUE lines, blank lines and '#'
 * comments; strips matching single/double quotes around values. No variable
 * expansion and no `export ` prefix support: lines without a valid KEY=VALUE
 * shape (including `export KEY=...`, whose key fails validation) are reported
 * as malformed and skipped.
 */
export function parseEnvFile(content: string): EnvFileParseResult {
  const vars: [string, string][] = [];
  const malformedLines: number[] = [];

  content.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) return;

    const eq = line.indexOf('=');
    const key = eq === -1 ? '' : line.slice(0, eq).trim();
    if (eq === -1 || !KEY_PATTERN.test(key)) {
      malformedLines.push(index + 1);
      return;
    }

    let value = line.slice(eq + 1).trim();
    if (value.length >= 2) {
      const quote = value[0];
      if ((quote === '"' || quote === "'") && value[value.length - 1] === quote) {
        value = value.slice(1, -1);
      }
    }
    vars.push([key, value]);
  });

  return { vars, malformedLines };
}

export interface EnvMergeResult {
  services: ManifestService[];
  warnings: string[];
}

/**
 * Resolve each service's envFile(s) relative to the zs.yaml directory, merge
 * them into the service env and drop the envFile field so the payload sent to
 * the backend stays plain ServiceDefinitionInput. Precedence: envFiles in
 * listed order (last file wins), then the zs.yaml `env` list overrides both.
 * Missing files and malformed lines produce warnings; the deploy continues.
 */
export function applyEnvFiles(services: ManifestService[], manifestDir: string): EnvMergeResult {
  const warnings: string[] = [];

  const merged = services.map((service) => {
    if (service.envFile === undefined) return service;

    const files = Array.isArray(service.envFile) ? service.envFile : [service.envFile];
    // Values are kept as raw "KEY=VALUE" strings so zs.yaml env entries keep
    // their exact spelling (values may contain '=').
    const envByKey = new Map<string, string>();

    for (const file of files) {
      const filePath = path.resolve(manifestDir, file);
      if (!fs.existsSync(filePath)) {
        warnings.push(`zs.yaml: envFile '${file}' not found for service '${service.name}'; skipping`);
        continue;
      }

      const { vars, malformedLines } = parseEnvFile(fs.readFileSync(filePath, 'utf-8'));
      for (const line of malformedLines) {
        warnings.push(`zs.yaml: envFile '${file}' for service '${service.name}': line ${line} ignored (expected KEY=VALUE)`);
      }
      for (const [key, value] of vars) {
        envByKey.set(key, `${key}=${value}`);
      }
    }

    for (const entry of service.env ?? []) {
      const eq = entry.indexOf('=');
      envByKey.set(eq === -1 ? entry : entry.slice(0, eq), entry);
    }

    const { envFile: _envFile, ...rest } = service;
    return { ...rest, env: [...envByKey.values()] };
  });

  return { services: merged, warnings };
}
