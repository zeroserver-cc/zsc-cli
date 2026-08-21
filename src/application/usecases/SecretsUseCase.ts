import { AppSecret } from '../../domain/entities/types';
import { gqlRequest } from '../../infrastructure/graphql/client';
import {
  APP_SECRETS_QUERY,
  UPSERT_APP_SECRET_MUTATION,
  DELETE_APP_SECRET_MUTATION
} from '../../infrastructure/graphql/queries';
import { getConfigValue } from '../../infrastructure/config/store';
import { resolveApplicationByName } from './DomainUseCase';

function requireToken(): string {
  const token = getConfigValue('accessToken');
  if (!token) throw new Error('Not logged in. Run "zs login" first.');
  return token;
}

// Stores (or replaces) a secret of an application. The value travels only in
// the mutation variables over HTTPS: the API is write-only and never returns
// it, and the CLI never keeps it on disk.
export async function setAppSecretUseCase(
  appNameOrId: string,
  key: string,
  value: string
): Promise<void> {
  const token = requireToken();
  const app = await resolveApplicationByName(appNameOrId, token);
  await gqlRequest<{ upsertAppSecret: boolean }>(
    UPSERT_APP_SECRET_MUTATION,
    { applicationId: app.id, key, value },
    token
  );
}

export async function listAppSecretsUseCase(appNameOrId: string): Promise<AppSecret[]> {
  const token = requireToken();
  const app = await resolveApplicationByName(appNameOrId, token);
  const data = await gqlRequest<{ appSecrets: AppSecret[] }>(
    APP_SECRETS_QUERY,
    { applicationId: app.id },
    token
  );
  return data.appSecrets;
}

export async function deleteAppSecretUseCase(appNameOrId: string, key: string): Promise<boolean> {
  const token = requireToken();
  const app = await resolveApplicationByName(appNameOrId, token);
  const data = await gqlRequest<{ deleteAppSecret: boolean }>(
    DELETE_APP_SECRET_MUTATION,
    { applicationId: app.id, key },
    token
  );
  return data.deleteAppSecret;
}

export interface AppSecretImportFailure {
  key: string;
  error: string;
}

export interface AppSecretImportResult {
  imported: number;
  failures: AppSecretImportFailure[];
}

// Upserts sequentially and records per-key failures instead of aborting: one
// rejected entry must not lose the rest of an imported .env file.
export async function importAppSecretsUseCase(
  appNameOrId: string,
  vars: [string, string][]
): Promise<AppSecretImportResult> {
  const token = requireToken();
  const app = await resolveApplicationByName(appNameOrId, token);
  const result: AppSecretImportResult = { imported: 0, failures: [] };
  for (const [key, value] of vars) {
    try {
      await gqlRequest<{ upsertAppSecret: boolean }>(
        UPSERT_APP_SECRET_MUTATION,
        { applicationId: app.id, key, value },
        token
      );
      result.imported += 1;
    } catch (err) {
      result.failures.push({ key, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return result;
}
