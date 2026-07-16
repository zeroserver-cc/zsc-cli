import { Machine } from '../../domain/entities/types';
import { gqlRequest } from '../../infrastructure/graphql/client';
import { UPDATE_MACHINE_RESOURCE_LIMITS_MUTATION } from '../../infrastructure/graphql/queries';
import { getConfigValue } from '../../infrastructure/config/store';

// Field semantics follow the backend contract: a number sets the limit, null
// clears it, and undefined omits the variable from the request (JSON.stringify
// drops undefined keys), leaving the current limit untouched.
export interface MachineResourceLimitsInput {
  sharedVCpu?: number | null;
  sharedMemoryMb?: number | null;
  sharedStorageMb?: number | null;
}

export async function configureMachineResourcesUseCase(
  id: string,
  limits: MachineResourceLimitsInput,
): Promise<Machine> {
  const token = getConfigValue('accessToken');
  if (!token) throw new Error('Not logged in. Run "zs login" first.');

  const data = await gqlRequest<{ updateMachineResourceLimits: Machine }>(
    UPDATE_MACHINE_RESOURCE_LIMITS_MUTATION,
    { id, ...limits },
    token,
  );
  return data.updateMachineResourceLimits;
}
