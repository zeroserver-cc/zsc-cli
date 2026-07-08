import { Machine } from '../../domain/entities/types';
import { gqlRequest } from '../../infrastructure/graphql/client';
import { CLAIM_MACHINE_MUTATION } from '../../infrastructure/graphql/queries';
import { getConfigValue } from '../../infrastructure/config/store';

export async function claimMachineUseCase(token: string): Promise<Machine> {
  const authToken = getConfigValue('accessToken');
  if (!authToken) throw new Error('Not logged in. Run "zs login" first.');

  const data = await gqlRequest<{ claimMachine: Machine }>(
    CLAIM_MACHINE_MUTATION,
    { token },
    authToken,
  );
  return data.claimMachine;
}
