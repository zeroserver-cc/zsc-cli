import { Application, ApplicationInstance, AppManifest, ManifestPlacement } from '../../domain/entities/types';
import { gqlRequest } from '../../infrastructure/graphql/client';
import {
  CREATE_APPLICATION_MUTATION,
  DEPLOY_APPLICATION_MUTATION,
  MY_APPLICATIONS_QUERY,
  UPDATE_APPLICATION_MUTATION,
} from '../../infrastructure/graphql/queries';
import { getConfigValue } from '../../infrastructure/config/store';
import { loadManifestFile } from '../manifest/loadManifestFile';
import { manifestToCreateInput } from '../manifest/toCreateInput';
import { normalizePlacement, toDeployPlacementInput } from '../placement';
import { waitForInstance, WaitResult } from './waitForInstance';

export interface ManifestDeployResult extends WaitResult {
  manifest: AppManifest;
  /** Effective placement sent to the backend (flags win over zs.yaml), when set. */
  placement?: ManifestPlacement;
  /** Non-fatal problems found while loading the manifest (e.g. missing envFile). */
  warnings: string[];
}

export interface ManifestDeployOptions {
  /** CLI flag overrides; each set flag wins over the corresponding zs.yaml placement field. */
  placement?: ManifestPlacement;
}

/**
 * Deploy a multi-service application described by a zs.yaml in `dir` (ZSC-110).
 * Reuses the application by name when it already exists (syncing its services[]
 * from the manifest first, so zs.yaml changes are not silently ignored),
 * creates it with the full services[] the first time, triggers the deploy,
 * then polls until the instance is terminal.
 */
export async function deployManifestUseCase(
  dir: string = process.cwd(),
  onProgress?: (status: string) => void,
  options: ManifestDeployOptions = {},
): Promise<ManifestDeployResult> {
  const token = getConfigValue('accessToken');
  if (!token) throw new Error('Not logged in. Run "zs login" first.');

  const warnings: string[] = [];
  const manifest = loadManifestFile(dir, (warning) => {
    warnings.push(warning);
    onProgress?.(warning);
  });
  const appName = manifest.app;

  let applicationId: string;
  const mine = await gqlRequest<{ myApplications: Application[] }>(MY_APPLICATIONS_QUERY, {}, token);
  const existing = mine.myApplications.find((a) => a.name === appName)?.id;
  if (existing) {
    applicationId = existing;
    // The backend deploys from the app's stored services[], so a redeploy must
    // first sync the composition from the current zs.yaml. config is omitted on
    // purpose: an empty object would wipe config set via the portal.
    await gqlRequest<{ updateApplication: Application }>(
      UPDATE_APPLICATION_MUTATION,
      { id: applicationId, input: { name: manifest.app, services: manifest.services } },
      token,
    );
  } else {
    const appData = await gqlRequest<{ createApplication: Application }>(
      CREATE_APPLICATION_MUTATION,
      { input: manifestToCreateInput(manifest) },
      token,
    );
    applicationId = appData.createApplication.id;
  }

  // No image/env/ports override: the backend deploys from the app's services[].
  // Forward AI requirements declared in the manifest so the scheduler picks a
  // node with the right GPU/ML capabilities.
  const aiRequirements = manifest.ai
    ? {
        requiresGpu: manifest.ai.gpu,
        requiresLlm: manifest.ai.llm,
        requiresVideo: manifest.ai.video,
        requiresAudio: manifest.ai.audio,
        requiresImage: manifest.ai.image,
      }
    : {};
  // Soft geographic preference (ZSC-194): CLI flags win over the zs.yaml
  // placement section per field; the backend falls back to any eligible node
  // when nothing matches.
  const placement = normalizePlacement({
    country: options.placement?.country ?? manifest.placement?.country,
    region: options.placement?.region ?? manifest.placement?.region,
  });
  const deployData = await gqlRequest<{ deployApplication: ApplicationInstance }>(
    DEPLOY_APPLICATION_MUTATION,
    { input: { applicationId, ...aiRequirements, ...toDeployPlacementInput(placement) } },
    token,
  );

  const result = await waitForInstance(deployData.deployApplication, applicationId, token, onProgress);
  return { ...result, manifest, warnings, ...(placement && { placement }) };
}
