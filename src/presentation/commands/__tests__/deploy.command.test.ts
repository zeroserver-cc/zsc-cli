import { Command } from 'commander';
import { registerDeployCommand } from '../deploy';
import { deployApplicationUseCase } from '../../../application/usecases/DeployApplicationUseCase';
import { deployManifestUseCase } from '../../../application/usecases/DeployManifestUseCase';

jest.mock('ora', () => ({
  __esModule: true,
  default: jest.fn(() => {
    const spinner = {
      text: '',
      fail: jest.fn(),
      succeed: jest.fn(),
      warn: jest.fn(),
      start: jest.fn()
    };
    spinner.start.mockReturnValue(spinner);
    return spinner;
  })
}));
jest.mock('../../../application/usecases/requireRole');
jest.mock('../../../application/usecases/DeployManifestUseCase');
jest.mock('../../../application/usecases/DeployApplicationUseCase', () => ({
  ...jest.requireActual('../../../application/usecases/DeployApplicationUseCase'),
  deployApplicationUseCase: jest.fn()
}));

const mockedDeployApplication = deployApplicationUseCase as jest.MockedFunction<
  typeof deployApplicationUseCase
>;
const mockedDeployManifest = deployManifestUseCase as jest.MockedFunction<
  typeof deployManifestUseCase
>;

const outcome = (deploymentStatus: string) =>
  ({
    instance: { id: 'inst-1', applicationId: 'app-1', status: 'RUNNING' },
    deployment: { id: 'dep-1', image: 'ghcr.io/x/app:1', status: deploymentStatus },
    deployments: [],
    timedOut: false
  }) as any;

const manifestOutcome = (deploymentStatus: string) => ({
  ...outcome(deploymentStatus),
  manifest: { app: 'site' },
  placement: undefined,
  warnings: []
});

describe('deploy command exit code', () => {
  let program: Command;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    program = new Command();
    registerDeployCommand(program);
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    process.exitCode = undefined;
  });

  afterEach(() => {
    logSpy.mockRestore();
    // Never leak a failing exit code into the jest process itself.
    process.exitCode = undefined;
  });

  describe('with zs.yaml (no image)', () => {
    it('exits 1 when the deployment was rolled back', async () => {
      mockedDeployManifest.mockResolvedValue(manifestOutcome('ROLLED_BACK'));

      await program.parseAsync(['node', 'zs', 'deploy']);

      expect(process.exitCode).toBe(1);
    });

    it('keeps exit code 0 when the deployment succeeded', async () => {
      mockedDeployManifest.mockResolvedValue(manifestOutcome('SUCCESS'));

      await program.parseAsync(['node', 'zs', 'deploy']);

      expect(process.exitCode).toBeUndefined();
    });
  });

  describe('with a single image', () => {
    it('exits 1 when the deployment failed', async () => {
      mockedDeployApplication.mockResolvedValue(outcome('FAILED'));

      await program.parseAsync(['node', 'zs', 'deploy', 'ghcr.io/x/app:1', '--name', 'site']);

      expect(process.exitCode).toBe(1);
    });

    it('keeps exit code 0 when the deployment succeeded', async () => {
      mockedDeployApplication.mockResolvedValue(outcome('SUCCESS'));

      await program.parseAsync(['node', 'zs', 'deploy', 'ghcr.io/x/app:1', '--name', 'site']);

      expect(process.exitCode).toBeUndefined();
    });
  });

  describe('replicas', () => {
    beforeEach(() => {
      mockedDeployApplication.mockClear();
      mockedDeployManifest.mockClear();
    });

    const printed = () => logSpy.mock.calls.map((call) => call.join(' ')).join('\n');

    const replicaStatus = {
      desiredReplicas: 3,
      effectiveReplicas: 3,
      runningReplicas: 1,
      replicaWarnings: []
    };

    it('passes --replicas to the zs.yaml deploy and prints the replica report', async () => {
      mockedDeployManifest.mockResolvedValue({
        ...manifestOutcome('SUCCESS'),
        replicas: { requested: 3, status: replicaStatus }
      });

      await program.parseAsync(['node', 'zs', 'deploy', '--replicas', '3']);

      expect(mockedDeployManifest).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Function),
        expect.objectContaining({ replicas: 3 })
      );
      expect(printed()).toContain('3 requested, 3 effective, 1 running');
      expect(printed()).toContain('no sticky sessions');
    });

    it('passes --replicas to the single-image deploy', async () => {
      mockedDeployApplication.mockResolvedValue({
        ...outcome('SUCCESS'),
        replicas: { requested: 2, status: { ...replicaStatus, desiredReplicas: 2 } }
      });

      await program.parseAsync([
        'node',
        'zs',
        'deploy',
        'ghcr.io/x/app:1',
        '--name',
        'site',
        '--replicas',
        '2'
      ]);

      expect(mockedDeployApplication.mock.calls[0][0]).toMatchObject({ replicas: 2 });
    });

    it('leaves replicas undefined and prints no replica section when the flag is absent', async () => {
      mockedDeployManifest.mockResolvedValue(manifestOutcome('SUCCESS'));

      await program.parseAsync(['node', 'zs', 'deploy']);

      expect(mockedDeployManifest.mock.calls[0][2]).toMatchObject({ replicas: undefined });
      expect(printed()).not.toContain('Replicas:');
    });

    it('prints the platform warnings after a successful deploy', async () => {
      mockedDeployManifest.mockResolvedValue({
        ...manifestOutcome('SUCCESS'),
        replicas: {
          requested: 3,
          status: {
            ...replicaStatus,
            effectiveReplicas: 1,
            runningReplicas: 1,
            replicaWarnings: ['Apps with volumes keep a single replica.']
          }
        }
      });

      await program.parseAsync(['node', 'zs', 'deploy']);

      expect(printed()).toContain('Warning: Apps with volumes keep a single replica.');
    });

    it('prints no replica report when the deploy failed', async () => {
      mockedDeployManifest.mockResolvedValue({
        ...manifestOutcome('FAILED'),
        replicas: { requested: 3, status: replicaStatus }
      });

      await program.parseAsync(['node', 'zs', 'deploy', '--replicas', '3']);

      expect(process.exitCode).toBe(1);
      expect(printed()).not.toContain('Replicas:');
    });

    it.each(['0', '-2', 'many'])('rejects --replicas %p', async (value) => {
      const exitOverride = new Command();
      exitOverride.exitOverride();
      exitOverride.configureOutput({ writeErr: () => undefined, writeOut: () => undefined });
      registerDeployCommand(exitOverride);

      await expect(
        exitOverride.parseAsync(['node', 'zs', 'deploy', '--replicas', value])
      ).rejects.toThrow();
      expect(mockedDeployManifest).not.toHaveBeenCalled();
    });
  });
});
