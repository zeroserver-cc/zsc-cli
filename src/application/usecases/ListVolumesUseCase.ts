import { ApplicationVolume } from '../../domain/entities/types';
import { gqlRequest } from '../../infrastructure/graphql/client';
import { APPLICATION_VOLUMES_QUERY } from '../../infrastructure/graphql/queries';
import { getConfigValue } from '../../infrastructure/config/store';

export interface VolumeRow {
  name: string;
  mountPath: string;
  serviceName: string;
  nodeId: string;
  lastSnapshot: string;
}

export async function listVolumesUseCase(applicationId: string): Promise<VolumeRow[]> {
  const token = getConfigValue('accessToken');
  if (!token) throw new Error('Not logged in. Run "zs login" first.');

  const data = await gqlRequest<{ applicationVolumes: ApplicationVolume[] }>(
    APPLICATION_VOLUMES_QUERY,
    { applicationId },
    token,
  );

  return data.applicationVolumes.map((volume) => ({
    name: volume.name,
    mountPath: volume.mountPath,
    serviceName: volume.serviceName,
    nodeId: volume.nodeId ?? '-',
    lastSnapshot: volume.lastSnapshotAt
      ? `${new Date(volume.lastSnapshotAt).toLocaleString()} (${volume.lastSnapshotKey ?? 'unknown'})`
      : '-',
  }));
}
