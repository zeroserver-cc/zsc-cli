import { Application, ApplicationInstance, AppManifest, ManifestPlacement } from '../../domain/entities/types';
import { gqlRequest } from '../../infrastructure/graphql/client';
import {
  CREATE_APPLICATION_MUTATION,
  DEPLOY_APPLICATION_MUTATION,
  MY_APPLICATIONS_QUERY,
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
}

export interface ManifestDeployOptions {
  /** CLI flag overrides; each set flag wins over the corresponding zs.yaml placement field. */
  placement?: ManifestPlacement;
}

/**
 * Deploy a multi-service application described by a zs.yaml in `dir` (ZSC-110).
 * Reuses the application by name when it already exists, creates it with the
 * full services[] the first time, triggers the deploy, then polls until the
 * instance is terminal.
 */
export async function deployManifestUseCase(
  dir: string = process.cwd(),
  onProgress?: (status: string) => void,
  options: ManifestDeployOptions = {},
): Promise<ManifestDeployResult> {
  const token = getConfigValue('accessToken');
  if (!token) throw new Error('Not logged in. Run "zs login" first.');

  const manifest = loadManifestFile(dir);
  const appName = manifest.app;

  let applicationId: string;
  const mine = await gqlRequest<{ myApplications: Application[] }>(MY_APPLICATIONS_QUERY, {}, token);
  const existing = mine.myApplications.find((a) => a.name === appName)?.id;
  if (existing) {
    applicationId = existing;
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

  const result = await waitForInstance(deployData.deployApplication, token, onProgress);
  return { ...result, manifest, ...(placement && { placement }) };
}
