import { Application, ApplicationInstance, AppManifest } from '../../domain/entities/types';
import { gqlRequest } from '../../infrastructure/graphql/client';
import {
  CREATE_APPLICATION_MUTATION,
  DEPLOY_APPLICATION_MUTATION,
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
 * Creates the application with the full services[] (same payload as the portal
 * wizard), triggers the deploy, then polls until the instance is terminal.
 */
export async function deployManifestUseCase(
  dir: string = process.cwd(),
  onProgress?: (status: string) => void,
): Promise<ManifestDeployResult> {
  const token = getConfigValue('accessToken');
  if (!token) throw new Error('Not logged in. Run "zs login" first.');

  const manifest = loadManifestFile(dir);

  const appData = await gqlRequest<{ createApplication: Application }>(
    CREATE_APPLICATION_MUTATION,
    { input: manifestToCreateInput(manifest) },
    token,
  );
  const applicationId = appData.createApplication.id;

  // No image/env/ports override: the backend deploys from the app's services[].
  const deployData = await gqlRequest<{ deployApplication: ApplicationInstance }>(
    DEPLOY_APPLICATION_MUTATION,
    { input: { applicationId } },
    token,
  );

  const result = await waitForInstance(deployData.deployApplication, token, onProgress);
  return { ...result, manifest };
}
