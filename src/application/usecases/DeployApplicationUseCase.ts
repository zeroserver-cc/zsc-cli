import { Application, ApplicationInstance, DeployInput } from '../../domain/entities/types';
import { gqlRequest } from '../../infrastructure/graphql/client';
import {
  CREATE_APPLICATION_MUTATION,
  DEPLOY_APPLICATION_MUTATION,
} from '../../infrastructure/graphql/queries';
import { getConfigValue } from '../../infrastructure/config/store';
import { waitForInstance, WaitResult } from './waitForInstance';

export type DeployResult = WaitResult;

export async function deployApplicationUseCase(
  input: DeployInput,
  onProgress?: (status: string) => void,
): Promise<DeployResult> {
  const token = getConfigValue('token');
  if (!token) throw new Error('Not logged in. Run "zs login" first.');

  const appName = input.name ?? deriveAppName(input.image);

  const appData = await gqlRequest<{ createApplication: Application }>(
    CREATE_APPLICATION_MUTATION,
    { input: { name: appName, dockerImage: input.image, config: {} } },
    token,
  );
  const applicationId = appData.createApplication.id;

  // The backend expects ports as a { hostPort: containerPort } object (JSON
  // scalar). Expose the container port on the same host port.
  const ports = input.port ? { [input.port]: input.port } : undefined;

  const deployData = await gqlRequest<{ deployApplication: ApplicationInstance }>(
    DEPLOY_APPLICATION_MUTATION,
    {
      input: {
        applicationId,
        image: input.image,
        containerName: `${appName}-${Date.now()}`,
        env: input.env ?? [],
        ...(ports && { ports }),
      },
    },
    token,
  );

  return waitForInstance(deployData.deployApplication, token, onProgress);
}

function deriveAppName(image: string): string {
  return image.split('/').pop()?.split(':')[0] ?? image;
}
