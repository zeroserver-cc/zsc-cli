import { ApplicationInstance } from '../../domain/entities/types';
import { gqlRequest } from '../../infrastructure/graphql/client';
import { REMOVE_APPLICATION_MUTATION } from '../../infrastructure/graphql/queries';
import { getConfigValue } from '../../infrastructure/config/store';

export async function removeApplicationUseCase(instanceId: string): Promise<ApplicationInstance> {
  const token = getConfigValue('token');
  if (!token) throw new Error('Not logged in. Run "zs login" first.');

  const data = await gqlRequest<{ removeApplication: ApplicationInstance }>(
    REMOVE_APPLICATION_MUTATION,
    { instanceId },
    token,
  );
  return data.removeApplication;
}
