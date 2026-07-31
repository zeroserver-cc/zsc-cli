import { ApplicationInstance, Deployment } from '../../domain/entities/types';
import { gqlRequest } from '../../infrastructure/graphql/client';
import { APPLICATION_INSTANCE_QUERY, DEPLOYMENTS_QUERY } from '../../infrastructure/graphql/queries';

const TERMINAL_STATUSES = new Set(['RUNNING', 'ERROR', 'FAILED', 'STOPPED']);
const INSTANCE_FAILURE_STATUSES = new Set(['ERROR', 'FAILED', 'STOPPED']);
const POLL_INTERVAL_MS = 3_000;
const MAX_POLLS = 60; // 3 minutes

export interface WaitResult {
  instance: ApplicationInstance;
  /** Newest deployment of the application: the source of truth for this deploy. */
  deployment?: Deployment;
  /** Recent deployment history (last fetched page), so the presentation layer
   * can resolve related records (e.g. the FAILED cause of a ROLLED_BACK). */
  deployments?: Deployment[];
  timedOut: boolean;
}

/**
 * Poll an instance until the deploy reaches a terminal outcome or times out.
 * Shared by the single-image and zs.yaml deploy flows.
 *
 * The instance status alone is not enough: on redeploy the stable instance
 * stays RUNNING while the new deployment is still PENDING, so the newest
 * deployment record is the source of truth for the outcome of this deploy.
 * When the deployment history cannot be read (missing deploys:read scope,
 * older backend, transient failure), the wait degrades to the legacy
 * instance-only behavior instead of aborting the deploy.
 */
export async function waitForInstance(
  initial: ApplicationInstance,
  applicationId: string,
  token: string,
  onProgress?: (status: string) => void,
): Promise<WaitResult> {
  let instance = initial;
  let warnedUnavailable = false;
  const fetchHistory = async (): Promise<Deployment[] | undefined> => {
    try {
      return await fetchDeploymentHistory(applicationId, token);
    } catch {
      if (!warnedUnavailable) {
        warnedUnavailable = true;
        onProgress?.('deployment history unavailable, falling back to instance status');
      }
      return undefined;
    }
  };

  // The backend creates the PENDING deployment synchronously inside the deploy
  // mutation, so the newest record is always the deploy just triggered. Fetch
  // it before evaluating the initial instance: on redeploy the instance is
  // already RUNNING and must not short-circuit the wait.
  let history = await fetchHistory();
  let deployment = newestDeployment(history);
  let polls = 0;

  while (!isDone(instance, deployment) && polls < MAX_POLLS) {
    onProgress?.(progressLabel(instance, deployment));
    await sleep(POLL_INTERVAL_MS);
    const [pollData, latest] = await Promise.all([
      gqlRequest<{ applicationInstance: ApplicationInstance }>(
        APPLICATION_INSTANCE_QUERY,
        { id: instance.id },
        token,
      ),
      fetchHistory(),
    ]);
    instance = pollData.applicationInstance ?? instance;
    if (latest) {
      history = latest;
      deployment = newestDeployment(latest) ?? deployment;
    }
    polls++;
  }

  return {
    instance,
    deployment,
    deployments: history,
    timedOut: polls >= MAX_POLLS && !isDone(instance, deployment),
  };
}

// A deploy is done when the newest deployment reaches a terminal state
// (SUCCESS/FAILED/ROLLED_BACK), or when the instance fails on its own. While
// the deployment is still PENDING the instance reporting RUNNING means
// nothing: the old container may simply still be up.
function isDone(instance: ApplicationInstance, deployment?: Deployment): boolean {
  if (deployment) {
    if (deployment.status === 'PENDING') {
      return INSTANCE_FAILURE_STATUSES.has(instance.status);
    }
    return true;
  }
  return TERMINAL_STATUSES.has(instance.status);
}

function progressLabel(instance: ApplicationInstance, deployment?: Deployment): string {
  if (deployment?.status === 'PENDING') {
    return `${instance.status} (deploy in progress)`;
  }
  return instance.status;
}

async function fetchDeploymentHistory(applicationId: string, token: string): Promise<Deployment[]> {
  const data = await gqlRequest<{ deployments: Deployment[] }>(
    DEPLOYMENTS_QUERY,
    { applicationId, limit: 5 },
    token,
  );
  return data.deployments;
}

// The backend returns history newest-first, but sort client-side by createdAt
// to not depend on that ordering.
function newestDeployment(deployments?: Deployment[]): Deployment | undefined {
  if (!deployments) return undefined;
  return [...deployments].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
