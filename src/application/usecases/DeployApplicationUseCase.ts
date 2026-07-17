import { Application, ApplicationInstance, DeployInput } from '../../domain/entities/types';
import { gqlRequest } from '../../infrastructure/graphql/client';
import {
  CREATE_APPLICATION_MUTATION,
  DEPLOY_APPLICATION_MUTATION,
  MY_APPLICATIONS_QUERY,
} from '../../infrastructure/graphql/queries';
import { getConfigValue } from '../../infrastructure/config/store';
import { toDeployPlacementInput } from '../placement';
import { waitForInstance, WaitResult } from './waitForInstance';

export type DeployResult = WaitResult;

export async function deployApplicationUseCase(
  input: DeployInput,
  onProgress?: (status: string) => void,
): Promise<DeployResult> {
  const token = getConfigValue('accessToken');
  if (!token) throw new Error('Not logged in. Run "zs login" first.');

  const appName = input.name ?? deriveAppName(input.image);

  // Resolve the target application deterministically:
  //  1. --app-id pins an exact application (no lookup, no create) — the robust path
  //     once the first deploy has created the app and the id is wired into CI.
  //  2. otherwise reuse the app with this name if it exists (idempotent), so a
  //     redeploy lands on the same app and the backend updates it in place.
  //  3. only create a brand-new app the first time.
  let applicationId: string;
  if (input.appId) {
    applicationId = input.appId;
  } else {
    const mine = await gqlRequest<{ myApplications: Application[] }>(MY_APPLICATIONS_QUERY, {}, token);
    const existing = mine.myApplications.find((a) => a.name === appName)?.id;
    if (existing) {
      applicationId = existing;
    } else {
      const appData = await gqlRequest<{ createApplication: Application }>(
        CREATE_APPLICATION_MUTATION,
        { input: { name: appName, dockerImage: input.image, config: {} } },
        token,
      );
      applicationId = appData.createApplication.id;
    }
  }

  // The backend expects ports as a { hostPort: containerPort } object (JSON
  // scalar). Expose the container port on the same host port.
  const ports = input.port ? { [input.port]: input.port } : undefined;

  const deployData = await gqlRequest<{ deployApplication: ApplicationInstance }>(
    DEPLOY_APPLICATION_MUTATION,
    {
      input: {
        applicationId,
        image: input.image,
        // Stable name (not timestamped) so redeploys target the same container.
        containerName: appName,
        env: input.env ?? [],
        ...(ports && { ports }),
        // Soft geographic preference (ZSC-194): the backend falls back to any
        // eligible node when nothing matches the requested country/region.
        ...toDeployPlacementInput({ country: input.country, region: input.region }),
      },
    },
    token,
  );

  return waitForInstance(deployData.deployApplication, token, onProgress);
}

function deriveAppName(image: string): string {
  return image.split('/').pop()?.split(':')[0] ?? image;
}
