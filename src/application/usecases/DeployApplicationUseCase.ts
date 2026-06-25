import { Application, ApplicationInstance, DeployInput } from '../../domain/entities/types';
import { gqlRequest } from '../../infrastructure/graphql/client';
import {
  CREATE_APPLICATION_MUTATION,
  DEPLOY_APPLICATION_MUTATION,
  APPLICATION_INSTANCE_QUERY,
} from '../../infrastructure/graphql/queries';
import { getConfigValue } from '../../infrastructure/config/store';

const TERMINAL_STATUSES = new Set(['RUNNING', 'ERROR', 'FAILED', 'STOPPED']);
const POLL_INTERVAL_MS = 3_000;
const MAX_POLLS = 60; // 3 minutes

export interface DeployResult {
  instance: ApplicationInstance;
  timedOut: boolean;
}

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

  const ports = input.port
    ? [{ internal: input.port, protocol: 'TCP' }]
    : undefined;

  const deployData = await gqlRequest<{ deployApplication: ApplicationInstance }>(
    DEPLOY_APPLICATION_MUTATION,
    {
      input: {
        applicationId,
        image: input.image,
        containerName: `${appName}-${Date.now()}`,
        env: input.env ?? [],
        ports: ports ? JSON.stringify(ports) : undefined,
      },
    },
    token,
  );

  let instance = deployData.deployApplication;
  let polls = 0;

  while (!TERMINAL_STATUSES.has(instance.status) && polls < MAX_POLLS) {
    onProgress?.(instance.status);
    await sleep(POLL_INTERVAL_MS);
    const pollData = await gqlRequest<{ applicationInstance: ApplicationInstance }>(
      APPLICATION_INSTANCE_QUERY,
      { id: instance.id },
      token,
    );
    instance = pollData.applicationInstance ?? instance;
    polls++;
  }

  return { instance, timedOut: polls >= MAX_POLLS };
}

function deriveAppName(image: string): string {
  return image.split('/').pop()?.split(':')[0] ?? image;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
