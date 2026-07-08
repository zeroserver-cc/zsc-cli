import { User } from '../../domain/entities/types';
import { gqlRequest } from '../../infrastructure/graphql/client';
import { ME_QUERY } from '../../infrastructure/graphql/queries';
import { getConfigValue } from '../../infrastructure/config/store';

export async function whoamiUseCase(): Promise<User> {
  const token = getConfigValue('accessToken');
  if (!token) throw new Error('Not logged in. Run "zs login" first.');

  const data = await gqlRequest<{ me: User }>(ME_QUERY, undefined, token);
  return data.me;
}
