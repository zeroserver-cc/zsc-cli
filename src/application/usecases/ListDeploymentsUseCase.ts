import { Deployment } from '../../domain/entities/types';
import { gqlRequest } from '../../infrastructure/graphql/client';
import { DEPLOYMENTS_QUERY } from '../../infrastructure/graphql/queries';
import { getConfigValue } from '../../infrastructure/config/store';
import { resolveApplicationByName } from './DomainUseCase';

const DEFAULT_LIMIT = 20;

export async function listDeploymentsUseCase(appName: string, limit = DEFAULT_LIMIT): Promise<Deployment[]> {
  const token = getConfigValue('accessToken');
  if (!token) throw new Error('Not logged in. Run "zs login" first.');

  const app = await resolveApplicationByName(appName, token);
  const data = await gqlRequest<{ deployments: Deployment[] }>(
    DEPLOYMENTS_QUERY,
    { applicationId: app.id, limit },
    token,
  );
  return data.deployments;
}
