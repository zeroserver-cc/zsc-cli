import { parse } from 'yaml';
import { AppManifest, ManifestAIRequirements, ManifestPlacement, ManifestService } from '../../domain/entities/types';

export class ManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManifestError';
  }
}

/**
 * Parse and validate a zs.yaml manifest into an AppManifest. Throws ManifestError
 * with an actionable message on any problem. The validated shape maps 1:1 to the
 * backend's createApplication services[] input (ZSC-110).
 */
export function parseManifest(content: string): AppManifest {
  let raw: unknown;
  try {
    raw = parse(content);
  } catch (err) {
    throw new ManifestError(`zs.yaml is not valid YAML: ${(err as Error).message}`);
  }

  if (!isRecord(raw)) {
    throw new ManifestError('zs.yaml is empty or not a mapping. See the reference for the expected shape.');
  }

  const app = raw.app;
  if (typeof app !== 'string' || app.trim() === '') {
    throw new ManifestError('zs.yaml: "app" is required and must be a non-empty string.');
  }

  if (!Array.isArray(raw.services) || raw.services.length === 0) {
    throw new ManifestError('zs.yaml: "services" is required and must list at least one service.');
  }

  const services = raw.services.map((svc, i) => validateService(svc, i));

  const exposedCount = services.filter((s) => s.exposed).length;
  if (exposedCount > 1) {
    throw new ManifestError('zs.yaml: only one service can be "exposed" in the MVP (one public URL per app).');
  }

  validateNamedVolumes(services);

  const ai = raw.ai !== undefined ? validateAIRequirements(raw.ai) : undefined;
  const placement = raw.placement !== undefined ? validatePlacement(raw.placement) : undefined;

  return { app, ai, placement, services };
}

function validateAIRequirements(raw: unknown): ManifestAIRequirements {
  if (!isRecord(raw)) {
    throw new ManifestError('zs.yaml: "ai" must be a mapping with boolean flags (gpu, llm, video, audio, image).');
  }

  const allowed = ['gpu', 'llm', 'video', 'audio', 'image'];
  const result: ManifestAIRequirements = {};

  for (const key of allowed) {
    const value = raw[key];
    if (value === undefined) continue;
    if (typeof value !== 'boolean') {
      throw new ManifestError(`zs.yaml: "ai.${key}" must be true or false.`);
    }
    result[key as keyof ManifestAIRequirements] = value;
  }

  return result;
}

function validatePlacement(raw: unknown): ManifestPlacement {
  if (!isRecord(raw)) {
    throw new ManifestError(
      'zs.yaml: "placement" must be a mapping with "country" and/or "region" (e.g. placement: { country: BR, region: RS }).',
    );
  }

  const result: ManifestPlacement = {};

  if (raw.country !== undefined) {
    if (typeof raw.country !== 'string' || !/^[a-zA-Z]{2}$/.test(raw.country.trim())) {
      throw new ManifestError('zs.yaml: "placement.country" must be a 2-letter ISO 3166-1 alpha-2 code (e.g. "BR").');
    }
    result.country = raw.country;
  }

  if (raw.region !== undefined) {
    if (typeof raw.region !== 'string' || raw.region.trim() === '') {
      throw new ManifestError('zs.yaml: "placement.region" must be a non-empty string (e.g. "RS").');
    }
    result.region = raw.region;
  }

  return result;
}

function validateService(svc: unknown, index: number): ManifestService {
  const where = `services[${index}]`;
  if (!isRecord(svc)) {
    throw new ManifestError(`zs.yaml: ${where} must be a mapping with at least "name" and "image".`);
  }

  if (typeof svc.name !== 'string' || svc.name.trim() === '') {
    throw new ManifestError(`zs.yaml: ${where}.name is required and must be a non-empty string.`);
  }
  const name = svc.name;

  if (typeof svc.image !== 'string' || svc.image.trim() === '') {
    throw new ManifestError(`zs.yaml: ${where} ("${name}") needs an "image" (a registry image; the ZS does not build from source in the MVP).`);
  }

  const service: ManifestService = { name, image: svc.image };

  if (svc.env !== undefined) service.env = toStringArray(svc.env, `${where}.env`);
  if (svc.ports !== undefined) service.ports = toStringArray(svc.ports, `${where}.ports`);
  if (svc.volumes !== undefined) service.volumes = toVolumeStringArray(svc.volumes, `${where}.volumes`);
  if (svc.dependsOn !== undefined) service.dependsOn = toStringArray(svc.dependsOn, `${where}.dependsOn`);
  if (svc.exposed !== undefined) {
    if (typeof svc.exposed !== 'boolean') {
      throw new ManifestError(`zs.yaml: ${where}.exposed must be true or false.`);
    }
    service.exposed = svc.exposed;
  }

  return service;
}

// ports may be written as numbers (e.g. "- 3000"); the backend expects strings.
function toStringArray(value: unknown, where: string): string[] {
  if (!Array.isArray(value)) {
    throw new ManifestError(`zs.yaml: ${where} must be a list.`);
  }
  return value.map((item, i) => {
    if (typeof item === 'string') return item;
    if (typeof item === 'number') return String(item);
    throw new ManifestError(`zs.yaml: ${where}[${i}] must be a string or number.`);
  });
}

function validateNamedVolumes(services: ManifestService[]): void {
  const seenNames = new Set<string>();

  for (const service of services) {
    for (const volumeString of service.volumes ?? []) {
      const parts = volumeString.split(':');
      if (parts.length < 2) {
        throw new ManifestError(
          `zs.yaml: invalid volume "${volumeString}" in service "${service.name}". Expected "name:/container/path" or "/host/path:/container/path".`,
        );
      }

      const [name, mountPath] = parts;
      if (name.startsWith('/')) continue; // bind mount, not validated here

      if (!mountPath.startsWith('/')) {
        throw new ManifestError(
          `zs.yaml: volume "${volumeString}" in service "${service.name}" must use an absolute container path.`,
        );
      }

      if (seenNames.has(name)) {
        throw new ManifestError(
          `zs.yaml: duplicate named volume "${name}". Volume names must be unique within an app.`,
        );
      }
      seenNames.add(name);
    }
  }
}

function toVolumeStringArray(value: unknown, where: string): string[] {
  if (!Array.isArray(value)) {
    throw new ManifestError(`zs.yaml: ${where} must be a list.`);
  }
  return value.map((item, i) => {
    if (typeof item === 'string') return item;
    throw new ManifestError(
      `zs.yaml: ${where}[${i}] must be a string (e.g. "data:/var/lib/data" or "/host:/container:ro"). ` +
        'Unquoted YAML values with a colon become objects; wrap the volume in quotes.',
    );
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
