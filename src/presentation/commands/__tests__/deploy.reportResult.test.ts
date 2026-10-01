import { reportResult } from '../deploy';
import { deriveAppName } from '../../../application/usecases/DeployApplicationUseCase';

const spinner = () => ({ warn: jest.fn(), fail: jest.fn(), succeed: jest.fn() }) as any;

const instance = (status: string) =>
  ({ id: 'inst-1', applicationId: 'app-1', status, createdAt: '2026-07-31T00:00:00Z' }) as any;

const deployment = (status: string, overrides: Record<string, unknown> = {}) =>
  ({
    id: 'dep-1',
    image: 'ghcr.io/x/app:1',
    status,
    createdAt: '2026-07-31T00:00:01Z',
    ...overrides
  }) as any;

let logSpy: jest.SpyInstance;

beforeEach(() => {
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  logSpy.mockRestore();
});

it('surfaces the original FAILED deployment error on ROLLED_BACK', async () => {
  const rollback = deployment('ROLLED_BACK', { id: 'dep-rb', rollbackOf: 'dep-failed' });
  const cause = deployment('FAILED', {
    id: 'dep-failed',
    error: 'manifest unknown: image not found'
  });

  reportResult(
    spinner(),
    {
      instance: instance('RUNNING'),
      deployment: rollback,
      deployments: [rollback, cause],
      timedOut: false
    },
    'my-app'
  );

  expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('manifest unknown: image not found'));
});

it('keeps the generic rollback message when the cause is not in the history page', async () => {
  const rollback = deployment('ROLLED_BACK', { id: 'dep-rb', rollbackOf: 'dep-old', error: null });

  const s = spinner();
  reportResult(
    s,
    {
      instance: instance('RUNNING'),
      deployment: rollback,
      deployments: [rollback],
      timedOut: false
    },
    'my-app'
  );

  expect(s.fail).toHaveBeenCalledWith(expect.stringContaining('rollback'));
  expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('Error:'));
});

it('includes the app name in the failure hints', async () => {
  reportResult(
    spinner(),
    {
      instance: instance('RUNNING'),
      deployment: deployment('FAILED', { error: 'boom' }),
      deployments: [],
      timedOut: false
    },
    'site'
  );

  expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('zs deployments site'));
});

describe('reportResult outcome (drives the process exit code)', () => {
  it('reports success when the deployment succeeded', () => {
    const outcome = reportResult(
      spinner(),
      {
        instance: instance('RUNNING'),
        deployment: deployment('SUCCESS'),
        deployments: [],
        timedOut: false
      },
      'site'
    );

    expect(outcome).toBe(true);
  });

  it('reports failure when the deployment FAILED, even though the stable instance keeps RUNNING', () => {
    const outcome = reportResult(
      spinner(),
      {
        instance: instance('RUNNING'),
        deployment: deployment('FAILED', { error: 'boom' }),
        deployments: [],
        timedOut: false
      },
      'site'
    );

    expect(outcome).toBe(false);
  });

  it('reports failure when the deployment was ROLLED_BACK', () => {
    const outcome = reportResult(
      spinner(),
      {
        instance: instance('RUNNING'),
        deployment: deployment('ROLLED_BACK', { rollbackOf: 'dep-failed' }),
        deployments: [],
        timedOut: false
      },
      'site'
    );

    expect(outcome).toBe(false);
  });

  it('reports failure when waiting for a terminal status timed out', () => {
    const outcome = reportResult(
      spinner(),
      {
        instance: instance('DEPLOYING'),
        deployment: undefined,
        deployments: [],
        timedOut: true
      },
      'site'
    );

    expect(outcome).toBe(false);
  });

  it('reports failure when the instance ended in a non-running status', () => {
    const outcome = reportResult(
      spinner(),
      {
        instance: instance('ERROR'),
        deployment: undefined,
        deployments: [],
        timedOut: false
      },
      'site'
    );

    expect(outcome).toBe(false);
  });
});

it('derives the app name from the image when no name is given', () => {
  expect(deriveAppName('ghcr.io/x/site:abc')).toBe('site');
  expect(deriveAppName('redis:7')).toBe('redis');
});
