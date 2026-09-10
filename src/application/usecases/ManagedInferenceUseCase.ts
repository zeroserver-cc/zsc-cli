import {
  AddInferenceServiceTokenPayload,
  AiModel,
  CreateInferenceServicePayload,
  HfModelFile,
  HfModelSummary,
  InferenceServiceToken,
  ManagedInferenceService
} from '../../domain/entities/types';
import { gqlRequest } from '../../infrastructure/graphql/client';
import {
  ADD_INFERENCE_SERVICE_TOKEN_MUTATION,
  AI_MODELS_QUERY,
  CREATE_INFERENCE_SERVICE_MUTATION,
  DELETE_INFERENCE_SERVICE_MUTATION,
  HF_MODEL_FILES_QUERY,
  MY_INFERENCE_SERVICES_QUERY,
  REVOKE_INFERENCE_SERVICE_TOKEN_MUTATION,
  SEARCH_HF_MODELS_QUERY
} from '../../infrastructure/graphql/queries';
import { getConfigValue } from '../../infrastructure/config/store';

function requireToken(): string {
  const token = getConfigValue('accessToken');
  if (!token) throw new Error('Not logged in. Run "zs login" first.');
  return token;
}

export async function listAiModelsUseCase(): Promise<AiModel[]> {
  const token = requireToken();
  const data = await gqlRequest<{ aiModels: AiModel[] }>(AI_MODELS_QUERY, {}, token);
  return data.aiModels;
}

/** Search Hugging Face GGUF repos; the backend proxies the HF API (ZSC-210). */
export async function searchHfModelsUseCase(search: string): Promise<HfModelSummary[]> {
  const token = requireToken();
  const data = await gqlRequest<{ searchHfModels: HfModelSummary[] }>(
    SEARCH_HF_MODELS_QUERY,
    { search },
    token
  );
  return data.searchHfModels;
}

/** List the root-level GGUF files of a Hugging Face repo, with the recommended pick flagged. */
export async function listHfModelFilesUseCase(repoId: string): Promise<HfModelFile[]> {
  const token = requireToken();
  const data = await gqlRequest<{ hfModelFiles: HfModelFile[] }>(
    HF_MODEL_FILES_QUERY,
    { repoId },
    token
  );
  return data.hfModelFiles;
}

export async function listInferenceServicesUseCase(): Promise<ManagedInferenceService[]> {
  const token = requireToken();
  const data = await gqlRequest<{ myInferenceServices: ManagedInferenceService[] }>(
    MY_INFERENCE_SERVICES_QUERY,
    {},
    token
  );
  return data.myInferenceServices;
}

/**
 * Resolve a user-given target to an inference service: an exact name wins,
 * otherwise an unambiguous id prefix is accepted (same rule as "zs db").
 */
export async function resolveInferenceServiceUseCase(
  nameOrId: string
): Promise<ManagedInferenceService> {
  const services = await listInferenceServicesUseCase();

  const byName = services.filter((service) => service.name === nameOrId);
  if (byName.length === 1) return byName[0];
  if (byName.length > 1) {
    throw new Error(
      `Ambiguous inference service name "${nameOrId}" (${byName.length} matches). Use the id instead (see "zs ai list").`
    );
  }

  const byIdPrefix = services.filter((service) => service.id.startsWith(nameOrId));
  if (byIdPrefix.length === 1) return byIdPrefix[0];
  if (byIdPrefix.length > 1) {
    throw new Error(
      `Ambiguous inference service id prefix "${nameOrId}" (${byIdPrefix.length} matches). Use a longer prefix.`
    );
  }

  throw new Error(
    `Unknown inference service "${nameOrId}". Run "zs ai list" to see your services.`
  );
}

export async function createInferenceServiceUseCase(
  name: string,
  modelId: string,
  vramBudgetMb?: number
): Promise<CreateInferenceServicePayload> {
  const token = requireToken();
  const input: { name: string; modelId: string; vramBudgetMb?: number } = { name, modelId };
  // Omitted on purpose when undefined: no budget means full GPU offload.
  if (vramBudgetMb !== undefined) input.vramBudgetMb = vramBudgetMb;
  const data = await gqlRequest<{ createInferenceService: CreateInferenceServicePayload }>(
    CREATE_INFERENCE_SERVICE_MUTATION,
    { input },
    token
  );
  return data.createInferenceService;
}

export async function deleteInferenceServiceUseCase(
  nameOrId: string
): Promise<{ service: ManagedInferenceService; deleted: boolean }> {
  const token = requireToken();
  const service = await resolveInferenceServiceUseCase(nameOrId);
  const data = await gqlRequest<{ deleteInferenceService: boolean }>(
    DELETE_INFERENCE_SERVICE_MUTATION,
    { id: service.id },
    token
  );
  return { service, deleted: data.deleteInferenceService };
}

/** Resolve a token inside a service: exact id wins, else an unambiguous id prefix. */
function resolveServiceToken(
  service: ManagedInferenceService,
  tokenIdOrPrefix: string
): InferenceServiceToken {
  const byId = service.tokens.filter((token) => token.id === tokenIdOrPrefix);
  if (byId.length === 1) return byId[0];

  const byPrefix = service.tokens.filter((token) => token.id.startsWith(tokenIdOrPrefix));
  if (byPrefix.length === 1) return byPrefix[0];
  if (byPrefix.length > 1) {
    throw new Error(
      `Ambiguous token id prefix "${tokenIdOrPrefix}" (${byPrefix.length} matches). Use a longer prefix (see "zs ai token list ${service.name}").`
    );
  }

  throw new Error(
    `Unknown token "${tokenIdOrPrefix}" on service "${service.name}". Run "zs ai token list ${service.name}" to see its tokens.`
  );
}

export async function addInferenceServiceTokenUseCase(
  nameOrId: string,
  label: string
): Promise<{ service: ManagedInferenceService; token: AddInferenceServiceTokenPayload }> {
  const token = requireToken();
  const service = await resolveInferenceServiceUseCase(nameOrId);
  const data = await gqlRequest<{ addInferenceServiceToken: AddInferenceServiceTokenPayload }>(
    ADD_INFERENCE_SERVICE_TOKEN_MUTATION,
    { serviceId: service.id, label },
    token
  );
  return { service, token: data.addInferenceServiceToken };
}

export async function revokeInferenceServiceTokenUseCase(
  nameOrId: string,
  tokenIdOrPrefix: string
): Promise<{
  service: ManagedInferenceService;
  token: InferenceServiceToken;
  revoked: boolean;
}> {
  const authToken = requireToken();
  const service = await resolveInferenceServiceUseCase(nameOrId);
  const token = resolveServiceToken(service, tokenIdOrPrefix);
  const data = await gqlRequest<{ revokeInferenceServiceToken: boolean }>(
    REVOKE_INFERENCE_SERVICE_TOKEN_MUTATION,
    { serviceId: service.id, tokenId: token.id },
    authToken
  );
  return { service, token, revoked: data.revokeInferenceServiceToken };
}
