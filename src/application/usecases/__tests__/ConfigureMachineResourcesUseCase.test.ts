import { configureMachineResourcesUseCase } from '../ConfigureMachineResourcesUseCase';
import { gqlRequest } from '../../../infrastructure/graphql/client';
import { getConfigValue } from '../../../infrastructure/config/store';
import { UPDATE_MACHINE_RESOURCE_LIMITS_MUTATION } from '../../../infrastructure/graphql/queries';

jest.mock('../../../infrastructure/graphql/client');
jest.mock('../../../infrastructure/config/store');

const mockGql = gqlRequest as jest.MockedFunction<typeof gqlRequest>;

const machine = {
  id: 'm-1',
  name: 'home-server',
  status: 'ONLINE',
  sharedVCpu: 2,
  sharedMemoryMb: 4096,
  sharedStorageMb: 51200,
};

beforeEach(() => {
  jest.clearAllMocks();
  (getConfigValue as jest.Mock).mockReturnValue('a-token');
});

it('sends the mutation with the node id and the provided limits', async () => {
  mockGql.mockResolvedValue({ updateMachineResourceLimits: machine } as any);

  const result = await configureMachineResourcesUseCase('m-1', {
    sharedVCpu: 2,
    sharedMemoryMb: 4096,
    sharedStorageMb: 51200,
  });

  expect(mockGql).toHaveBeenCalledWith(
    UPDATE_MACHINE_RESOURCE_LIMITS_MUTATION,
    { id: 'm-1', sharedVCpu: 2, sharedMemoryMb: 4096, sharedStorageMb: 51200 },
    'a-token',
  );
  expect(result).toEqual(machine);
});

it('forwards null values so the backend clears those limits', async () => {
  mockGql.mockResolvedValue({
    updateMachineResourceLimits: { ...machine, sharedVCpu: null, sharedMemoryMb: null, sharedStorageMb: null },
  } as any);

  await configureMachineResourcesUseCase('m-1', {
    sharedVCpu: null,
    sharedMemoryMb: null,
    sharedStorageMb: null,
  });

  const variables = mockGql.mock.calls[0][1] as Record<string, unknown>;
  expect(variables).toEqual({ id: 'm-1', sharedVCpu: null, sharedMemoryMb: null, sharedStorageMb: null });
});

it('omits undefined fields so untouched limits stay unchanged', async () => {
  mockGql.mockResolvedValue({ updateMachineResourceLimits: machine } as any);

  await configureMachineResourcesUseCase('m-1', { sharedMemoryMb: 8192 });

  const variables = mockGql.mock.calls[0][1] as Record<string, unknown>;
  expect(variables).toEqual({ id: 'm-1', sharedMemoryMb: 8192 });
  expect(variables).not.toHaveProperty('sharedVCpu');
  expect(variables).not.toHaveProperty('sharedStorageMb');
});

it('requires a login token', async () => {
  (getConfigValue as jest.Mock).mockReturnValue(undefined);

  await expect(configureMachineResourcesUseCase('m-1', { sharedVCpu: 2 })).rejects.toThrow(/Not logged in/);
  expect(mockGql).not.toHaveBeenCalled();
});
