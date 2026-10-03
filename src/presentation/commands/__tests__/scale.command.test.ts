import { Command } from 'commander';
import { registerScaleCommand } from '../scale';
import { scaleApplicationUseCase } from '../../../application/usecases/ReplicasUseCase';
import { ReplicasNotSupportedError } from '../../../application/replicas';

const mockSpinner = {
  text: '',
  fail: jest.fn(),
  succeed: jest.fn(),
  warn: jest.fn(),
  start: jest.fn()
};
mockSpinner.start.mockReturnValue(mockSpinner);

jest.mock('ora', () => ({ __esModule: true, default: jest.fn(() => mockSpinner) }));
jest.mock('../../../application/usecases/requireRole');
jest.mock('../../../application/usecases/ReplicasUseCase');

const mockedScale = scaleApplicationUseCase as jest.MockedFunction<typeof scaleApplicationUseCase>;

describe('zs scale', () => {
  let program: Command;
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;
  let exitSpy: jest.SpyInstance;

  const printed = () => logSpy.mock.calls.map((call) => call.join(' ')).join('\n');
  const printedErrors = () => errorSpy.mock.calls.map((call) => call.join(' ')).join('\n');

  beforeEach(() => {
    jest.clearAllMocks();
    mockSpinner.start.mockReturnValue(mockSpinner);
    program = new Command();
    program.exitOverride();
    program.configureOutput({ writeErr: () => undefined, writeOut: () => undefined });
    registerScaleCommand(program);
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }) as never);
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('scales the app and prints desired, effective and running counts', async () => {
    mockedScale.mockResolvedValue({
      appName: 'site',
      status: {
        desiredReplicas: 3,
        effectiveReplicas: 3,
        runningReplicas: 1,
        replicaWarnings: []
      }
    });

    await program.parseAsync(['node', 'zs', 'scale', 'site', '3']);

    expect(mockedScale).toHaveBeenCalledWith('site', 3);
    expect(mockSpinner.succeed).toHaveBeenCalled();
    expect(printed()).toContain('3 requested, 3 effective, 1 running');
  });

  it('prints the replica warnings as warnings', async () => {
    mockedScale.mockResolvedValue({
      appName: 'site',
      status: {
        desiredReplicas: 3,
        effectiveReplicas: 1,
        runningReplicas: 1,
        replicaWarnings: ['Redeploy the app once (zs deploy) so replicas can be created from it.']
      }
    });

    await program.parseAsync(['node', 'zs', 'scale', 'site', '3']);

    expect(printed()).toContain(
      'Warning: Redeploy the app once (zs deploy) so replicas can be created from it.'
    );
  });

  it.each(['0', '-1', '2.5', 'abc'])(
    'rejects <replicas> %p before calling the backend',
    async (value) => {
      await expect(program.parseAsync(['node', 'zs', 'scale', 'site', value])).rejects.toThrow();

      expect(mockedScale).not.toHaveBeenCalled();
    }
  );

  it('shows the clear message when the backend does not support replicas', async () => {
    mockedScale.mockRejectedValue(new ReplicasNotSupportedError());

    await expect(program.parseAsync(['node', 'zs', 'scale', 'site', '3'])).rejects.toThrow(
      'process.exit(1)'
    );

    expect(mockSpinner.fail).toHaveBeenCalled();
    expect(printedErrors()).toContain('This backend does not support replicas yet');
    expect(printedErrors()).not.toContain('Cannot query field');
  });
});
