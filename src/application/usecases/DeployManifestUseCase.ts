import { Application, ApplicationInstance, AppManifest } from '../../domain/entities/types';
import { gqlRequest } from '../../infrastructure/graphql/client';
import {
  CREATE_APPLICATION_MUTATION,
  DEPLOY_APPLICATION_MUTATION,
  MY_APPLICATIONS_QUERY,
} from '../../infrastructure/graphql/queries';
import { getConfigValue } from '../../infrastructure/config/store';
import { loadManifestFile } from '../manifest/loadManifestFile';
import { manifestToCreateInput } from '../manifest/toCreateInput';
import { waitForInstance, WaitResult } from './waitForInstance';

export interface ManifestDeployResult extends WaitResult {
  manifest: AppManifest;
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
  const deployData = await gqlRequest<{ deployApplication: ApplicationInstance }>(
    DEPLOY_APPLICATION_MUTATION,
    { input: { applicationId, ...aiRequirements } },
    token,
  );

  const result = await waitForInstance(deployData.deployApplication, token, onProgress);
  return { ...result, manifest };
}
