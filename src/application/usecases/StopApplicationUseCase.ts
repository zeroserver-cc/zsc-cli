import { ApplicationInstance } from '../../domain/entities/types';
import { gqlRequest } from '../../infrastructure/graphql/client';
import { STOP_APPLICATION_MUTATION } from '../../infrastructure/graphql/queries';
import { getConfigValue } from '../../infrastructure/config/store';

export async function stopApplicationUseCase(instanceId: string): Promise<ApplicationInstance> {
  const token = getConfigValue('accessToken');
  if (!token) throw new Error('Not logged in. Run "zs login" first.');

  const data = await gqlRequest<{ stopApplication: ApplicationInstance }>(
    STOP_APPLICATION_MUTATION,
    { instanceId },
    token,
  );
  return data.stopApplication;
}
