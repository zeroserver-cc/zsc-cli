import { gqlRequest } from '../../infrastructure/graphql/client';
import { RESTORE_APPLICATION_VOLUMES_MUTATION } from '../../infrastructure/graphql/queries';
import { getConfigValue } from '../../infrastructure/config/store';

export interface RestoreVolumesResult {
  commandIds: string[];
  targetMachineId: string;
}

export async function restoreVolumesUseCase(applicationId: string): Promise<RestoreVolumesResult> {
  const token = getConfigValue('accessToken');
  if (!token) throw new Error('Not logged in. Run "zs login" first.');

  const data = await gqlRequest<{ restoreApplicationVolumes: RestoreVolumesResult }>(
    RESTORE_APPLICATION_VOLUMES_MUTATION,
    { applicationId },
    token,
  );

  return data.restoreApplicationVolumes;
}
