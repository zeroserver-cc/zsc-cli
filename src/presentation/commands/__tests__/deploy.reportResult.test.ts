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

describe('rolling redeploy notes', () => {
  const queued = (id: string) => deployment('QUEUED', { id, instanceId: `inst-${id}` });
  const printed = () => logSpy.mock.calls.map((call) => call.join(' ')).join('\n');

  const result = (root: any, others: any[]) => ({
    instance: instance('RUNNING'),
    deployment: root,
    deployments: [...others, root],
    timedOut: false
  });

  it('succeeds with an informational note when replicas are still queued', () => {
    const s = spinner();

    const outcome = reportResult(
      s,
      result(deployment('SUCCESS'), [queued('r2'), queued('r3')]),
      'site'
    );

    expect(outcome).toBe(true);
    expect(s.succeed).toHaveBeenCalled();
    expect(s.fail).not.toHaveBeenCalled();
    expect(printed()).toContain(
      'Rolling update in progress: 2 more replicas will update one at a time in the background.'
    );
    expect(printed()).toContain('zs deployments site');
  });

  it('uses the singular for a single queued replica', () => {
    reportResult(spinner(), result(deployment('SUCCESS'), [queued('r2')]), 'site');

    expect(printed()).toContain('1 more replica will update');
  });

  it('prints no rolling note when nothing is queued', () => {
    const outcome = reportResult(spinner(), result(deployment('SUCCESS'), []), 'site');

    expect(outcome).toBe(true);
    expect(printed()).not.toContain('Rolling update');
  });

  it('keeps failing and says the queued replicas will not be updated when the root FAILED', () => {
    const s = spinner();

    const outcome = reportResult(
      s,
      result(deployment('FAILED', { error: 'boom' }), [queued('r2'), queued('r3')]),
      'site'
    );

    expect(outcome).toBe(false);
    expect(s.fail).toHaveBeenCalled();
    expect(printed()).toContain('The remaining 2 replicas will not be updated');
    expect(printed()).toContain('keep the previous version');
    expect(printed()).not.toContain('Rolling update in progress');
  });

  it('keeps failing and says the queued replicas will not be updated when the root was ROLLED_BACK', () => {
    const outcome = reportResult(
      spinner(),
      result(deployment('ROLLED_BACK', { rollbackOf: 'dep-failed' }), [queued('r2')]),
      'site'
    );

    expect(outcome).toBe(false);
    expect(printed()).toContain('The remaining 1 replica will not be updated');
  });

  it('adds no cancellation note to a failure without a queue', () => {
    reportResult(spinner(), result(deployment('FAILED', { error: 'boom' }), []), 'site');

    expect(printed()).not.toContain('will not be updated');
  });
});

describe('platform details from instance.logs', () => {
  const withLogs = (status: string, logs: string) => ({ ...instance(status), logs });
  const printed = () => logSpy.mock.calls.map((c) => String(c[0])).join('\n');

  it('prints why the deploy failed when the deployment record has no error', () => {
    reportResult(
      spinner(),
      {
        instance: withLogs(
          'ERROR',
          'Failed to start on 5 different nodes, giving up. Last error: container exited immediately'
        ),
        deployment: deployment('FAILED', { error: null }),
        timedOut: false
      },
      'my-app'
    );

    expect(printed()).toContain('Failed to start on 5 different nodes');
  });

  it('does not repeat the instance logs when the deployment already has the error', () => {
    reportResult(
      spinner(),
      {
        instance: withLogs('ERROR', 'stale instance log'),
        deployment: deployment('FAILED', { error: 'manifest unknown' }),
        timedOut: false
      },
      'my-app'
    );

    expect(printed()).toContain('manifest unknown');
    expect(printed()).not.toContain('stale instance log');
  });

  it('prints the retry trail when the wait times out', () => {
    reportResult(
      spinner(),
      {
        instance: withLogs(
          'RESCHEDULING',
          'Attempt 3/5 failed on a node: no space left on device. Retrying on another node.'
        ),
        timedOut: true
      },
      'my-app'
    );

    expect(printed()).toContain('Attempt 3/5 failed');
  });

  it('prints the details when the deploy ends in an unexpected status', () => {
    const s = spinner();
    const succeeded = reportResult(
      s,
      {
        instance: withLogs(
          'ERROR',
          'Failed to start and no other eligible node is available. Last error: boom'
        ),
        timedOut: false
      },
      'my-app'
    );

    expect(succeeded).toBe(false);
    expect(printed()).toContain('no other eligible node is available');
  });
});
