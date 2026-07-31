import { ApplicationInstance } from '../../domain/entities/types';
import { gqlRequest } from '../../infrastructure/graphql/client';
import { RESTART_APPLICATION_MUTATION } from '../../infrastructure/graphql/queries';
import { getConfigValue } from '../../infrastructure/config/store';

export async function restartApplicationUseCase(instanceId: string): Promise<ApplicationInstance> {
  const token = getConfigValue('accessToken');
  if (!token) throw new Error('Not logged in. Run "zs login" first.');

  const data = await gqlRequest<{ restartApplication: ApplicationInstance }>(
    RESTART_APPLICATION_MUTATION,
    { instanceId },
    token,
  );
  return data.restartApplication;
}
