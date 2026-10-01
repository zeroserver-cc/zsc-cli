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
});
