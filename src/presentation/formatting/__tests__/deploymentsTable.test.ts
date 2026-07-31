import { printDeploymentsTable } from '../table';
import { Deployment } from '../../../domain/entities/types';

function deployment(partial: Partial<Deployment>): Deployment {
  return {
    id: 'dep-1',
    image: 'nginx:latest',
    status: 'SUCCESS',
    createdAt: '2026-07-27T10:00:00.000Z',
    finishedAt: '2026-07-27T10:00:42.000Z',
    ...partial,
  };
}

describe('printDeploymentsTable', () => {
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  function output(): string {
    return logSpy.mock.calls.map((call) => call.join(' ')).join('\n');
  }

  it('prints an empty-state message when there is no history', () => {
    printDeploymentsTable([]);

    expect(output()).toContain('No deployments found.');
  });

  it('renders statuses, duration and short creation date', () => {
    printDeploymentsTable([
      deployment({ status: 'SUCCESS' }),
      deployment({ id: 'dep-2', status: 'FAILED', error: 'image not found' }),
      deployment({ id: 'dep-3', status: 'ROLLED_BACK' }),
      deployment({ id: 'dep-4', status: 'PENDING', finishedAt: null }),
    ]);
    const text = output();

    expect(text).toContain('SUCCESS');
    expect(text).toContain('FAILED');
    expect(text).toContain('ROLLED_BACK');
    expect(text).toContain('PENDING');
    expect(text).toContain('42s');
    expect(text).toContain('2026-07-27 10:00');
    expect(text).toContain('image not found');
  });

  it('shows a dash for pending deployments without finishedAt', () => {
    printDeploymentsTable([deployment({ status: 'PENDING', finishedAt: null })]);

    expect(output()).toContain('—');
  });

  it('strips the registry prefix from long image refs', () => {
    printDeploymentsTable([
      deployment({ image: 'ghcr.io/zeroserver-cc/demo-apps/api:v1.2.3' }),
    ]);

    const text = output();
    expect(text).toContain('api:v1.2.3');
    expect(text).not.toContain('ghcr.io');
  });

  it('keeps short image refs intact', () => {
    printDeploymentsTable([deployment({ image: 'nginx:latest' })]);

    expect(output()).toContain('nginx:latest');
  });

  it('truncates long errors with an ellipsis', () => {
    const longError = 'x'.repeat(80);
    printDeploymentsTable([deployment({ status: 'FAILED', error: longError })]);

    const text = output();
    expect(text).not.toContain(longError);
    expect(text).toContain(`${'x'.repeat(59)}…`);
  });

  it('formats durations above a minute as minutes and seconds', () => {
    printDeploymentsTable([
      deployment({ finishedAt: '2026-07-27T10:03:12.000Z' }),
    ]);

    expect(output()).toContain('3m12s');
  });
});
