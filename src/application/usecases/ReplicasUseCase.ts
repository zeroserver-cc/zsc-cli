import { ReplicaStatus } from '../../domain/entities/types';
import { gqlRequest } from '../../infrastructure/graphql/client';
import {
  APPLICATION_REPLICA_STATUS_QUERY,
  SCALE_APPLICATION_MUTATION
} from '../../infrastructure/graphql/queries';
import { getConfigValue } from '../../infrastructure/config/store';
import { withReplicasSupport } from '../replicas';
import { resolveApplicationByName } from './DomainUseCase';

type ApplicationReplicas = ReplicaStatus & { id: string; name: string };

export interface ScaleResult {
  appName: string;
  status: ReplicaStatus;
}

/** Replicas a deploy asked for, plus what the platform reports after the deploy. */
export interface ReplicaOutcome {
  requested: number;
  /** Absent when the status could not be read after the deploy. */
  status?: ReplicaStatus;
}

export async function scaleApplicationUseCase(
  appNameOrId: string,
  replicas: number
): Promise<ScaleResult> {
  const token = getConfigValue('accessToken');
  if (!token) throw new Error('Not logged in. Run "zs login" first.');

  const app = await resolveApplicationByName(appNameOrId, token);
  const data = await withReplicasSupport(() =>
    gqlRequest<{ scaleApplication: ApplicationReplicas }>(
      SCALE_APPLICATION_MUTATION,
      { applicationId: app.id, replicas },
      token
    )
  );
  return { appName: data.scaleApplication.name, status: data.scaleApplication };
}

/**
 * Reads the replica state after a deploy that asked for replicas. The deploy
 * has already finished by then, so a failure here must not fail it: the caller
 * reports the missing status instead.
 */
export async function readReplicaOutcome(
  requested: number,
  applicationId: string,
  token: string
): Promise<ReplicaOutcome> {
  try {
    const data = await gqlRequest<{ application: ApplicationReplicas | null }>(
      APPLICATION_REPLICA_STATUS_QUERY,
      { id: applicationId },
      token
    );
    return { requested, ...(data.application && { status: data.application }) };
  } catch {
    return { requested };
  }
}
