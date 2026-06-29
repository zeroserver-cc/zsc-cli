import { ApplicationInstance } from '../../domain/entities/types';
import { gqlRequest } from '../../infrastructure/graphql/client';
import { APPLICATION_INSTANCE_QUERY } from '../../infrastructure/graphql/queries';

const TERMINAL_STATUSES = new Set(['RUNNING', 'ERROR', 'FAILED', 'STOPPED']);
const POLL_INTERVAL_MS = 3_000;
const MAX_POLLS = 60; // 3 minutes

export interface WaitResult {
  instance: ApplicationInstance;
  timedOut: boolean;
}

/**
 * Poll an instance until it reaches a terminal status or the deploy times out.
 * Shared by the single-image and zs.yaml deploy flows.
 */
export async function waitForInstance(
  initial: ApplicationInstance,
  token: string,
  onProgress?: (status: string) => void,
): Promise<WaitResult> {
  let instance = initial;
  let polls = 0;

  while (!TERMINAL_STATUSES.has(instance.status) && polls < MAX_POLLS) {
    onProgress?.(instance.status);
    await sleep(POLL_INTERVAL_MS);
    const pollData = await gqlRequest<{ applicationInstance: ApplicationInstance }>(
      APPLICATION_INSTANCE_QUERY,
      { id: instance.id },
      token,
    );
    instance = pollData.applicationInstance ?? instance;
    polls++;
  }

  return { instance, timedOut: polls >= MAX_POLLS };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
