import { waitForInstance } from '../waitForInstance';
import { gqlRequest } from '../../../infrastructure/graphql/client';
import {
  APPLICATION_INSTANCE_QUERY,
  DEPLOYMENTS_QUERY,
} from '../../../infrastructure/graphql/queries';

jest.mock('../../../infrastructure/graphql/client');

const mockGql = gqlRequest as jest.MockedFunction<typeof gqlRequest>;

const instance = (status: string) =>
  ({ id: 'inst-1', applicationId: 'app-1', status, createdAt: '2026-07-31T00:00:00Z' }) as any;

const deployment = (status: string, overrides: Record<string, unknown> = {}) =>
  ({ id: `dep-${status}`, image: 'ghcr.io/x/app:1', status, createdAt: '2026-07-31T00:00:01Z', ...overrides }) as any;

/**
 * The pre-loop fetch consumes the first entry of `deploymentHistory`; each
 * poll consumes the next (the last one repeats once the sequence is exhausted).
 */
function mockBackend(instanceStatus: string, deploymentHistory: any[][]) {
  let deploymentCalls = 0;
  mockGql.mockImplementation(async (query: string) => {
    if (query === APPLICATION_INSTANCE_QUERY) {
      return { applicationInstance: instance(instanceStatus) } as any;
    }
    if (query === DEPLOYMENTS_QUERY) {
      const batch = deploymentHistory[Math.min(deploymentCalls, deploymentHistory.length - 1)];
      deploymentCalls++;
      return { deployments: batch } as any;
    }
    throw new Error(`unexpected query: ${query}`);
  });
}

const deploymentQueryCalls = () => mockGql.mock.calls.filter((c) => c[0] === DEPLOYMENTS_QUERY).length;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

it('does not declare success on redeploy while the new deployment is still PENDING', async () => {
  // Regression guard: the stable instance is already RUNNING from the previous
  // deploy; the new deployment fails (e.g. invalid image). The CLI must wait
  // for the deployment record instead of trusting the instance status.
  mockBackend('RUNNING', [
    [deployment('PENDING')],
    [deployment('FAILED', { error: 'manifest unknown: image not found' })],
  ]);

  const resultPromise = waitForInstance(instance('RUNNING'), 'app-1', 'a-token');
  await jest.runAllTimersAsync();
  const result = await resultPromise;

  expect(result.timedOut).toBe(false);
  expect(result.deployment?.status).toBe('FAILED');
  expect(result.deployment?.error).toBe('manifest unknown: image not found');
  expect(deploymentQueryCalls()).toBeGreaterThan(1);
});

it('reports success when the deployment reaches SUCCESS', async () => {
  mockBackend('RUNNING', [
    [deployment('PENDING')],
    [deployment('SUCCESS', { finishedAt: '2026-07-31T00:01:00Z' })],
  ]);

  const resultPromise = waitForInstance(instance('PENDING'), 'app-1', 'a-token');
  await jest.runAllTimersAsync();
  const result = await resultPromise;

  expect(result.timedOut).toBe(false);
  expect(result.deployment?.status).toBe('SUCCESS');
  expect(result.instance.status).toBe('RUNNING');
});

it('reports a rolled back deployment as a terminal outcome', async () => {
  mockBackend('RUNNING', [
    [deployment('PENDING')],
    [
      deployment('ROLLED_BACK', { id: 'dep-rb', rollbackOf: 'dep-failed' }),
      deployment('FAILED', { id: 'dep-failed', error: 'container failed to start', createdAt: '2026-07-31T00:00:00Z' }),
    ],
  ]);

  const resultPromise = waitForInstance(instance('RUNNING'), 'app-1', 'a-token');
  await jest.runAllTimersAsync();
  const result = await resultPromise;

  expect(result.timedOut).toBe(false);
  expect(result.deployment?.status).toBe('ROLLED_BACK');
  // The history page is carried through so the presentation layer can resolve
  // the rollbackOf pointer to the original FAILED deployment and its error.
  const cause = result.deployments?.find((d) => d.id === result.deployment?.rollbackOf);
  expect(cause?.status).toBe('FAILED');
  expect(cause?.error).toBe('container failed to start');
});

it('falls back to instance-only polling when the deployments query fails', async () => {
  // E.g. an API key with only deploys:write (the deployments resolver requires
  // deploys:read), an older backend, or a transient failure: keep the legacy
  // behavior as the floor instead of aborting the wait.
  let instancePolls = 0;
  mockGql.mockImplementation(async (query: string) => {
    if (query === APPLICATION_INSTANCE_QUERY) {
      instancePolls++;
      return { applicationInstance: instance(instancePolls >= 2 ? 'RUNNING' : 'PENDING') } as any;
    }
    if (query === DEPLOYMENTS_QUERY) {
      throw new Error('Missing scope: deploys:read');
    }
    throw new Error(`unexpected query: ${query}`);
  });

  const onProgress = jest.fn();
  const resultPromise = waitForInstance(instance('PENDING'), 'app-1', 'a-token', onProgress);
  await jest.runAllTimersAsync();
  const result = await resultPromise;

  expect(result.timedOut).toBe(false);
  expect(result.deployment).toBeUndefined();
  expect(result.deployments).toBeUndefined();
  expect(result.instance.status).toBe('RUNNING');
  const warnings = onProgress.mock.calls.filter((c) =>
    String(c[0]).includes('deployment history unavailable'),
  );
  expect(warnings).toHaveLength(1);
});

it('stops waiting when the instance fails on its own, even with the deployment PENDING', async () => {
  mockBackend('ERROR', [[deployment('PENDING')]]);

  const resultPromise = waitForInstance(instance('PENDING'), 'app-1', 'a-token');
  await jest.runAllTimersAsync();
  const result = await resultPromise;

  expect(result.timedOut).toBe(false);
  expect(result.instance.status).toBe('ERROR');
});

it('times out when neither the instance nor the deployment reach a terminal state', async () => {
  mockBackend('PENDING', [[deployment('PENDING')]]);

  const resultPromise = waitForInstance(instance('PENDING'), 'app-1', 'a-token');
  await jest.runAllTimersAsync();
  const result = await resultPromise;

  expect(result.timedOut).toBe(true);
  expect(result.instance.status).toBe('PENDING');
  // 1 pre-loop fetch + 60 in-loop polls.
  expect(deploymentQueryCalls()).toBe(61);
});

it('falls back to the instance status when no deployment history exists', async () => {
  mockBackend('RUNNING', [[]]);

  const resultPromise = waitForInstance(instance('PENDING'), 'app-1', 'a-token');
  await jest.runAllTimersAsync();
  const result = await resultPromise;

  expect(result.timedOut).toBe(false);
  expect(result.deployment).toBeUndefined();
  expect(result.instance.status).toBe('RUNNING');
});
