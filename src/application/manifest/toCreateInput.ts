import { AppManifest } from '../../domain/entities/types';

export interface CreateApplicationInput {
  name: string;
  services: AppManifest['services'];
  config: Record<string, unknown>;
}

/**
 * Map a validated manifest to the backend's createApplication input. The manifest
 * services already match ServiceDefinitionInput, so this is the same multi-service
 * payload the portal wizard sends (ZSC-110).
 */
export function manifestToCreateInput(manifest: AppManifest): CreateApplicationInput {
  return {
    name: manifest.app,
    services: manifest.services,
    config: {},
  };
}
