import { ApplicationInstance } from '../../domain/entities/types';
import { gqlRequest } from '../../infrastructure/graphql/client';
import { APPLICATION_INSTANCE_QUERY } from '../../infrastructure/graphql/queries';
import { getConfigValue } from '../../infrastructure/config/store';

export async function getLogsUseCase(instanceId: string): Promise<string> {
  const token = getConfigValue('accessToken');
  if (!token) throw new Error('Not logged in. Run "zs login" first.');

  const data = await gqlRequest<{ applicationInstance: ApplicationInstance }>(
    APPLICATION_INSTANCE_QUERY,
    { id: instanceId },
    token,
  );

  if (!data.applicationInstance) throw new Error(`Instance "${instanceId}" not found.`);
  return data.applicationInstance.logs ?? '(no logs available)';
}
