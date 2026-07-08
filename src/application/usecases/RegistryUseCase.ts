import { RegistryCredential } from '../../domain/entities/types';
import { gqlRequest } from '../../infrastructure/graphql/client';
import {
  MY_REGISTRY_CREDENTIALS_QUERY,
  UPSERT_REGISTRY_CREDENTIAL_MUTATION,
  DELETE_REGISTRY_CREDENTIAL_MUTATION,
} from '../../infrastructure/graphql/queries';
import { getConfigValue } from '../../infrastructure/config/store';

function requireToken(): string {
  const token = getConfigValue('accessToken');
  if (!token) throw new Error('Not logged in. Run "zs login" first.');
  return token;
}

export interface RegistryLoginInput {
  registryHost: string;
  username: string;
  token: string;
}

// Stores (or replaces) a registry credential for the current developer. The
// token travels only in the mutation variables over HTTPS; it is never echoed
// back and never persisted on the client.
export async function registryLoginUseCase(input: RegistryLoginInput): Promise<RegistryCredential> {
  const authToken = requireToken();
  const data = await gqlRequest<{ upsertRegistryCredential: RegistryCredential }>(
    UPSERT_REGISTRY_CREDENTIAL_MUTATION,
    { input },
    authToken,
  );
  return data.upsertRegistryCredential;
}

export async function registryListUseCase(): Promise<RegistryCredential[]> {
  const authToken = requireToken();
  const data = await gqlRequest<{ myRegistryCredentials: RegistryCredential[] }>(
    MY_REGISTRY_CREDENTIALS_QUERY,
    undefined,
    authToken,
  );
  return data.myRegistryCredentials;
}

export async function registryLogoutUseCase(registryHost: string): Promise<boolean> {
  const authToken = requireToken();
  const data = await gqlRequest<{ deleteRegistryCredential: boolean }>(
    DELETE_REGISTRY_CREDENTIAL_MUTATION,
    { registryHost },
    authToken,
  );
  return data.deleteRegistryCredential;
}
