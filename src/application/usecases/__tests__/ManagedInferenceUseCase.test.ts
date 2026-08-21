import {
  addInferenceServiceTokenUseCase,
  createInferenceServiceUseCase,
  deleteInferenceServiceUseCase,
  listAiModelsUseCase,
  listInferenceServicesUseCase,
  resolveInferenceServiceUseCase,
  revokeInferenceServiceTokenUseCase
} from '../ManagedInferenceUseCase';
import { gqlRequest } from '../../../infrastructure/graphql/client';
import { getConfigValue } from '../../../infrastructure/config/store';
import {
  ADD_INFERENCE_SERVICE_TOKEN_MUTATION,
  AI_MODELS_QUERY,
  CREATE_INFERENCE_SERVICE_MUTATION,
  DELETE_INFERENCE_SERVICE_MUTATION,
  MY_INFERENCE_SERVICES_QUERY,
  REVOKE_INFERENCE_SERVICE_TOKEN_MUTATION
} from '../../../infrastructure/graphql/queries';
import { ManagedInferenceService } from '../../../domain/entities/types';

jest.mock('../../../infrastructure/graphql/client');
jest.mock('../../../infrastructure/config/store');

const mockGql = gqlRequest as jest.MockedFunction<typeof gqlRequest>;

const svc = (overrides: Partial<ManagedInferenceService>): ManagedInferenceService => ({
  id: 'svc-1',
  name: 'my-llm',
  modelId: 'qwen2.5-7b-q4',
  model: null,
  status: 'RUNNING',
  machineId: 'machine-1',
  machine: null,
  endpoint: 'https://my-llm.ai.zeroserver.cc',
  errorMessage: null,
  tokens: [{ id: 'tok-aaaa', label: 'web-app', hint: '…x7f2', createdAt: '2026-08-20T10:00:00Z' }],
  createdAt: '2026-08-20T09:00:00.000Z',
  updatedAt: '2026-08-20T10:00:00.000Z',
  ...overrides
});

beforeEach(() => {
  jest.clearAllMocks();
  (getConfigValue as jest.Mock).mockReturnValue('a-token');
});

describe('listAiModelsUseCase', () => {
  it('returns the catalog from aiModels', async () => {
    mockGql.mockResolvedValue({ aiModels: [{ id: 'qwen2.5-7b-q4' }] } as any);

    const result = await listAiModelsUseCase();

    expect(mockGql).toHaveBeenCalledWith(AI_MODELS_QUERY, {}, 'a-token');
    expect(result).toHaveLength(1);
  });

  it('fails early when there is no session token', async () => {
    (getConfigValue as jest.Mock).mockReturnValue(undefined);

    await expect(listAiModelsUseCase()).rejects.toThrow('Not logged in. Run "zs login" first.');
    expect(mockGql).not.toHaveBeenCalled();
  });
});

describe('listInferenceServicesUseCase', () => {
  it('returns the services from myInferenceServices', async () => {
    mockGql.mockResolvedValue({ myInferenceServices: [svc({})] } as any);

    const result = await listInferenceServicesUseCase();

    expect(mockGql).toHaveBeenCalledWith(MY_INFERENCE_SERVICES_QUERY, {}, 'a-token');
    expect(result[0].name).toBe('my-llm');
  });
});

describe('resolveInferenceServiceUseCase', () => {
  it('resolves an exact name match', async () => {
    mockGql.mockResolvedValue({
      myInferenceServices: [svc({}), svc({ id: 'svc-2', name: 'other' })]
    } as any);

    const result = await resolveInferenceServiceUseCase('other');

    expect(result.id).toBe('svc-2');
  });

  it('resolves a unique id prefix', async () => {
    mockGql.mockResolvedValue({
      myInferenceServices: [svc({ id: 'abc-111' }), svc({ id: 'def-222', name: 'other' })]
    } as any);

    const result = await resolveInferenceServiceUseCase('def-');

    expect(result.id).toBe('def-222');
  });

  it('fails on an ambiguous id prefix', async () => {
    mockGql.mockResolvedValue({
      myInferenceServices: [svc({ id: 'abc-111' }), svc({ id: 'abc-222', name: 'other' })]
    } as any);

    await expect(resolveInferenceServiceUseCase('abc')).rejects.toThrow(
      /Ambiguous inference service id prefix "abc" \(2 matches\)/
    );
  });

  it('fails on an ambiguous name', async () => {
    mockGql.mockResolvedValue({
      myInferenceServices: [svc({}), svc({ id: 'svc-2' })]
    } as any);

    await expect(resolveInferenceServiceUseCase('my-llm')).rejects.toThrow(
      /Ambiguous inference service name "my-llm" \(2 matches\)/
    );
  });

  it('fails when nothing matches', async () => {
    mockGql.mockResolvedValue({ myInferenceServices: [svc({})] } as any);

    await expect(resolveInferenceServiceUseCase('nope')).rejects.toThrow(
      'Unknown inference service "nope". Run "zs ai status" to see your services.'
    );
  });
});

describe('createInferenceServiceUseCase', () => {
  it('sends the create mutation and returns the payload with the initial token', async () => {
    mockGql.mockResolvedValue({
      createInferenceService: { service: svc({ status: 'PROVISIONING' }), initialToken: 'zsai-x' }
    } as any);

    const result = await createInferenceServiceUseCase('my-llm', 'qwen2.5-7b-q4');

    expect(mockGql).toHaveBeenCalledWith(
      CREATE_INFERENCE_SERVICE_MUTATION,
      { input: { name: 'my-llm', modelId: 'qwen2.5-7b-q4' } },
      'a-token'
    );
    expect(result.initialToken).toBe('zsai-x');
    expect(result.service.status).toBe('PROVISIONING');
  });
});

describe('deleteInferenceServiceUseCase', () => {
  it('resolves the target and deletes by id', async () => {
    mockGql.mockImplementation(async (query: string) => {
      if (query === MY_INFERENCE_SERVICES_QUERY) return { myInferenceServices: [svc({})] } as any;
      if (query === DELETE_INFERENCE_SERVICE_MUTATION)
        return { deleteInferenceService: true } as any;
      throw new Error(`unexpected query: ${query}`);
    });

    const result = await deleteInferenceServiceUseCase('my-llm');

    const deleteCall = mockGql.mock.calls.find((c) => c[0] === DELETE_INFERENCE_SERVICE_MUTATION)!;
    expect(deleteCall[1]).toEqual({ id: 'svc-1' });
    expect(result.deleted).toBe(true);
  });
});

describe('addInferenceServiceTokenUseCase', () => {
  it('resolves the target and adds a token by service id', async () => {
    mockGql.mockImplementation(async (query: string) => {
      if (query === MY_INFERENCE_SERVICES_QUERY) return { myInferenceServices: [svc({})] } as any;
      if (query === ADD_INFERENCE_SERVICE_TOKEN_MUTATION) {
        return {
          addInferenceServiceToken: {
            id: 'tok-bbbb',
            label: 'ci',
            hint: '…k9d1',
            createdAt: '2026-08-21T10:00:00Z',
            token: 'zsai-new-value'
          }
        } as any;
      }
      throw new Error(`unexpected query: ${query}`);
    });

    const result = await addInferenceServiceTokenUseCase('my-llm', 'ci');

    const addCall = mockGql.mock.calls.find((c) => c[0] === ADD_INFERENCE_SERVICE_TOKEN_MUTATION)!;
    expect(addCall[1]).toEqual({ serviceId: 'svc-1', label: 'ci' });
    expect(result.token.token).toBe('zsai-new-value');
  });
});

describe('revokeInferenceServiceTokenUseCase', () => {
  it('resolves a token id prefix and revokes by full id', async () => {
    mockGql.mockImplementation(async (query: string) => {
      if (query === MY_INFERENCE_SERVICES_QUERY) return { myInferenceServices: [svc({})] } as any;
      if (query === REVOKE_INFERENCE_SERVICE_TOKEN_MUTATION)
        return { revokeInferenceServiceToken: true } as any;
      throw new Error(`unexpected query: ${query}`);
    });

    const result = await revokeInferenceServiceTokenUseCase('my-llm', 'tok-aa');

    const revokeCall = mockGql.mock.calls.find(
      (c) => c[0] === REVOKE_INFERENCE_SERVICE_TOKEN_MUTATION
    )!;
    expect(revokeCall[1]).toEqual({ serviceId: 'svc-1', tokenId: 'tok-aaaa' });
    expect(result.revoked).toBe(true);
    expect(result.token.label).toBe('web-app');
  });

  it('fails on an ambiguous token id prefix', async () => {
    mockGql.mockResolvedValue({
      myInferenceServices: [
        svc({
          tokens: [
            { id: 'tok-aaaa', label: 'a', hint: '…1', createdAt: '2026-08-20T10:00:00Z' },
            { id: 'tok-aaab', label: 'b', hint: '…2', createdAt: '2026-08-20T11:00:00Z' }
          ]
        })
      ]
    } as any);

    await expect(revokeInferenceServiceTokenUseCase('my-llm', 'tok-aaa')).rejects.toThrow(
      /Ambiguous token id prefix "tok-aaa" \(2 matches\)/
    );
  });

  it('fails when the token does not exist on the service', async () => {
    mockGql.mockResolvedValue({ myInferenceServices: [svc({})] } as any);

    await expect(revokeInferenceServiceTokenUseCase('my-llm', 'tok-zzzz')).rejects.toThrow(
      'Unknown token "tok-zzzz" on service "my-llm".'
    );
    expect(mockGql.mock.calls.map((c) => c[0])).not.toContain(
      REVOKE_INFERENCE_SERVICE_TOKEN_MUTATION
    );
  });
});
