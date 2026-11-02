import { ManagedDatabase, ManagedDatabaseEngine } from '../../domain/entities/types';
import { gqlRequest } from '../../infrastructure/graphql/client';
import {
  CREATE_MANAGED_DATABASE_MUTATION,
  CREATE_MANAGED_DATABASE_MUTATION_WITHOUT_PLACEMENT,
  DELETE_MANAGED_DATABASE_MUTATION,
  MANAGED_DATABASE_CONNECTION_STRING_QUERY,
  MY_DATABASES_QUERY,
  MY_DATABASES_QUERY_WITHOUT_PLACEMENT,
  RESTORE_MANAGED_DATABASE_MUTATION,
  SET_MANAGED_DATABASE_REPLICAS_MUTATION,
  SET_MANAGED_DATABASE_REPLICAS_MUTATION_WITHOUT_PLACEMENT
} from '../../infrastructure/graphql/queries';
import { getConfigValue } from '../../infrastructure/config/store';

function requireToken(): string {
  const token = getConfigValue('accessToken');
  if (!token) throw new Error('Not logged in. Run "zs login" first.');
  return token;
}

const PLACEMENT_UNSUPPORTED = /Cannot query field "replicaPlacement"/i;

/**
 * Sends the operation selecting replicaPlacement and, when the backend
 * predates the field, sends it again without it. Safe for mutations too: a
 * selection the schema does not know fails validation, before anything runs.
 */
async function withPlacementFallback<T>(
  query: string,
  queryWithoutPlacement: string,
  variables: Record<string, unknown>,
  token: string
): Promise<T> {
  try {
    return await gqlRequest<T>(query, variables, token);
  } catch (err) {
    if (err instanceof Error && PLACEMENT_UNSUPPORTED.test(err.message)) {
      return gqlRequest<T>(queryWithoutPlacement, variables, token);
    }
    throw err;
  }
}

export async function listDatabasesUseCase(): Promise<ManagedDatabase[]> {
  const token = requireToken();
  const data = await withPlacementFallback<{ myDatabases: ManagedDatabase[] }>(
    MY_DATABASES_QUERY,
    MY_DATABASES_QUERY_WITHOUT_PLACEMENT,
    {},
    token
  );
  return data.myDatabases;
}

/**
 * Resolve a user-given target to a database: an exact name wins, otherwise an
 * unambiguous id prefix is accepted (same rule as "zs account switch").
 */
export async function resolveDatabaseUseCase(nameOrId: string): Promise<ManagedDatabase> {
  const databases = await listDatabasesUseCase();

  const byName = databases.filter((db) => db.name === nameOrId);
  if (byName.length === 1) return byName[0];
  if (byName.length > 1) {
    throw new Error(
      `Ambiguous database name "${nameOrId}" (${byName.length} matches). Use the id instead (see "zs db list").`
    );
  }

  const byIdPrefix = databases.filter((db) => db.id.startsWith(nameOrId));
  if (byIdPrefix.length === 1) return byIdPrefix[0];
  if (byIdPrefix.length > 1) {
    throw new Error(
      `Ambiguous database id prefix "${nameOrId}" (${byIdPrefix.length} matches). Use a longer prefix.`
    );
  }

  throw new Error(
    `Unknown database "${nameOrId}". Run "zs db list" to see your managed databases.`
  );
}

export async function createDatabaseUseCase(
  name: string,
  engine: ManagedDatabaseEngine,
  replicas?: number
): Promise<ManagedDatabase> {
  const token = requireToken();
  // Omitted when undefined so the backend default (1 replica) applies.
  const input: { name: string; engine: ManagedDatabaseEngine; replicas?: number } = {
    name,
    engine
  };
  if (replicas !== undefined) input.replicas = replicas;
  const data = await withPlacementFallback<{ createManagedDatabase: ManagedDatabase }>(
    CREATE_MANAGED_DATABASE_MUTATION,
    CREATE_MANAGED_DATABASE_MUTATION_WITHOUT_PLACEMENT,
    { input },
    token
  );
  return data.createManagedDatabase;
}

export async function getConnectionStringUseCase(
  nameOrId: string
): Promise<{ database: ManagedDatabase; url: string }> {
  const token = requireToken();
  const database = await resolveDatabaseUseCase(nameOrId);
  const data = await gqlRequest<{ managedDatabaseConnectionString: string }>(
    MANAGED_DATABASE_CONNECTION_STRING_QUERY,
    { id: database.id },
    token
  );
  return { database, url: data.managedDatabaseConnectionString };
}

export async function setDatabaseReplicasUseCase(
  nameOrId: string,
  replicas: number
): Promise<ManagedDatabase> {
  const token = requireToken();
  const database = await resolveDatabaseUseCase(nameOrId);
  const data = await withPlacementFallback<{ setManagedDatabaseReplicas: ManagedDatabase }>(
    SET_MANAGED_DATABASE_REPLICAS_MUTATION,
    SET_MANAGED_DATABASE_REPLICAS_MUTATION_WITHOUT_PLACEMENT,
    { id: database.id, replicas },
    token
  );
  return data.setManagedDatabaseReplicas;
}

export async function deleteDatabaseUseCase(
  nameOrId: string
): Promise<{ database: ManagedDatabase; deleted: boolean }> {
  const token = requireToken();
  const database = await resolveDatabaseUseCase(nameOrId);
  const data = await gqlRequest<{ deleteManagedDatabase: boolean }>(
    DELETE_MANAGED_DATABASE_MUTATION,
    { id: database.id },
    token
  );
  return { database, deleted: data.deleteManagedDatabase };
}

export async function restoreDatabaseUseCase(
  nameOrId: string
): Promise<{ database: ManagedDatabase; restored: boolean }> {
  const token = requireToken();
  const database = await resolveDatabaseUseCase(nameOrId);
  const data = await gqlRequest<{ restoreManagedDatabase: boolean }>(
    RESTORE_MANAGED_DATABASE_MUTATION,
    { id: database.id },
    token
  );
  return { database, restored: data.restoreManagedDatabase };
}
