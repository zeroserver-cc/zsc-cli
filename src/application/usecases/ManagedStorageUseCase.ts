import {
  CreatedManagedStorage,
  ManagedStorage,
  ManagedStorageAccessKey,
  ManagedStorageCreatedAccessKey,
  ManagedStorageUsageSeries
} from '../../domain/entities/types';
import { gqlRequest } from '../../infrastructure/graphql/client';
import {
  CREATE_MANAGED_STORAGE_ACCESS_KEY_MUTATION,
  CREATE_MANAGED_STORAGE_MUTATION,
  DELETE_MANAGED_STORAGE_MUTATION,
  MANAGED_STORAGES_QUERY,
  MANAGED_STORAGE_USAGE_QUERY,
  REVOKE_MANAGED_STORAGE_ACCESS_KEY_MUTATION
} from '../../infrastructure/graphql/queries';
import { getConfigValue } from '../../infrastructure/config/store';

function requireToken(): string {
  const token = getConfigValue('accessToken');
  if (!token) throw new Error('Not logged in. Run "zs login" first.');
  return token;
}

export async function listStoragesUseCase(): Promise<ManagedStorage[]> {
  const data = await gqlRequest<{ managedStorages: ManagedStorage[] }>(
    MANAGED_STORAGES_QUERY,
    {},
    requireToken()
  );
  return data.managedStorages;
}

/** An exact name wins; otherwise an unambiguous id prefix is accepted. */
export async function resolveStorageUseCase(nameOrId: string): Promise<ManagedStorage> {
  const storages = await listStoragesUseCase();

  const byName = storages.filter((storage) => storage.name === nameOrId);
  if (byName.length === 1) return byName[0];

  const byIdPrefix = storages.filter((storage) => storage.id.startsWith(nameOrId));
  if (byIdPrefix.length === 1) return byIdPrefix[0];
  if (byIdPrefix.length > 1) {
    throw new Error(
      `Ambiguous storage id prefix "${nameOrId}" (${byIdPrefix.length} matches). Use a longer prefix.`
    );
  }

  throw new Error(
    `Unknown storage "${nameOrId}". Run "zs storage list" to see your object storage instances.`
  );
}

export async function createStorageUseCase(
  name: string,
  quotaGb?: number,
  egressQuotaGb?: number
): Promise<CreatedManagedStorage> {
  // Omitted when undefined so the platform defaults apply.
  const input: { name: string; quotaGb?: number; egressQuotaGb?: number } = { name };
  if (quotaGb !== undefined) input.quotaGb = quotaGb;
  if (egressQuotaGb !== undefined) input.egressQuotaGb = egressQuotaGb;
  const data = await gqlRequest<{ createManagedStorage: CreatedManagedStorage }>(
    CREATE_MANAGED_STORAGE_MUTATION,
    { input },
    requireToken()
  );
  return data.createManagedStorage;
}

export async function deleteStorageUseCase(
  nameOrId: string
): Promise<{ storage: ManagedStorage; deleted: boolean }> {
  const token = requireToken();
  const storage = await resolveStorageUseCase(nameOrId);
  const data = await gqlRequest<{ deleteManagedStorage: boolean }>(
    DELETE_MANAGED_STORAGE_MUTATION,
    { id: storage.id },
    token
  );
  return { storage, deleted: data.deleteManagedStorage };
}

export async function getStorageUsageUseCase(
  nameOrId: string
): Promise<{ storage: ManagedStorage; usage: ManagedStorageUsageSeries }> {
  const token = requireToken();
  const storage = await resolveStorageUseCase(nameOrId);
  const data = await gqlRequest<{ managedStorageUsage: ManagedStorageUsageSeries }>(
    MANAGED_STORAGE_USAGE_QUERY,
    { id: storage.id },
    token
  );
  return { storage, usage: data.managedStorageUsage };
}

export async function createStorageKeyUseCase(
  nameOrId: string,
  label?: string
): Promise<{ storage: ManagedStorage; accessKey: ManagedStorageCreatedAccessKey }> {
  const token = requireToken();
  const storage = await resolveStorageUseCase(nameOrId);
  const data = await gqlRequest<{ createManagedStorageAccessKey: ManagedStorageCreatedAccessKey }>(
    CREATE_MANAGED_STORAGE_ACCESS_KEY_MUTATION,
    { storageId: storage.id, label },
    token
  );
  return { storage, accessKey: data.createManagedStorageAccessKey };
}

/** Finds a key by its id, an unambiguous id prefix or its access key id (AKIA-style). */
export function findAccessKey(storage: ManagedStorage, keyRef: string): ManagedStorageAccessKey {
  const exact = storage.accessKeys.filter((key) => key.id === keyRef || key.accessKeyId === keyRef);
  if (exact.length === 1) return exact[0];

  const byPrefix = storage.accessKeys.filter((key) => key.id.startsWith(keyRef));
  if (byPrefix.length === 1) return byPrefix[0];
  if (byPrefix.length > 1) {
    throw new Error(`Ambiguous key id prefix "${keyRef}" (${byPrefix.length} matches).`);
  }
  throw new Error(
    `Unknown key "${keyRef}" on ${storage.name}. Run "zs storage keys list ${storage.name}".`
  );
}

export function isLastActiveKey(storage: ManagedStorage, key: ManagedStorageAccessKey): boolean {
  const active = storage.accessKeys.filter((candidate) => candidate.status === 'ACTIVE');
  return key.status === 'ACTIVE' && active.length === 1;
}

export async function revokeStorageKeyUseCase(
  storage: ManagedStorage,
  key: ManagedStorageAccessKey
): Promise<boolean> {
  const data = await gqlRequest<{ revokeManagedStorageAccessKey: boolean }>(
    REVOKE_MANAGED_STORAGE_ACCESS_KEY_MUTATION,
    { storageId: storage.id, keyId: key.id },
    requireToken()
  );
  return data.revokeManagedStorageAccessKey;
}
