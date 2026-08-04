import { ManagedDatabase, ManagedDatabaseEngine } from '../../domain/entities/types';
import { gqlRequest } from '../../infrastructure/graphql/client';
import {
  CREATE_MANAGED_DATABASE_MUTATION,
  DELETE_MANAGED_DATABASE_MUTATION,
  MANAGED_DATABASE_CONNECTION_STRING_QUERY,
  MY_DATABASES_QUERY,
  RESTORE_MANAGED_DATABASE_MUTATION,
} from '../../infrastructure/graphql/queries';
import { getConfigValue } from '../../infrastructure/config/store';

function requireToken(): string {
  const token = getConfigValue('accessToken');
  if (!token) throw new Error('Not logged in. Run "zs login" first.');
  return token;
}

export async function listDatabasesUseCase(): Promise<ManagedDatabase[]> {
  const token = requireToken();
  const data = await gqlRequest<{ myDatabases: ManagedDatabase[] }>(MY_DATABASES_QUERY, {}, token);
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
      `Ambiguous database name "${nameOrId}" (${byName.length} matches). Use the id instead (see "zs db list").`,
    );
  }

  const byIdPrefix = databases.filter((db) => db.id.startsWith(nameOrId));
  if (byIdPrefix.length === 1) return byIdPrefix[0];
  if (byIdPrefix.length > 1) {
    throw new Error(`Ambiguous database id prefix "${nameOrId}" (${byIdPrefix.length} matches). Use a longer prefix.`);
  }

  throw new Error(`Unknown database "${nameOrId}". Run "zs db list" to see your managed databases.`);
}

export async function createDatabaseUseCase(name: string, engine: ManagedDatabaseEngine): Promise<ManagedDatabase> {
  const token = requireToken();
  const data = await gqlRequest<{ createManagedDatabase: ManagedDatabase }>(
    CREATE_MANAGED_DATABASE_MUTATION,
    { input: { name, engine } },
    token,
  );
  return data.createManagedDatabase;
}

export async function getConnectionStringUseCase(nameOrId: string): Promise<{ database: ManagedDatabase; url: string }> {
  const token = requireToken();
  const database = await resolveDatabaseUseCase(nameOrId);
  const data = await gqlRequest<{ managedDatabaseConnectionString: string }>(
    MANAGED_DATABASE_CONNECTION_STRING_QUERY,
    { id: database.id },
    token,
  );
  return { database, url: data.managedDatabaseConnectionString };
}

export async function deleteDatabaseUseCase(nameOrId: string): Promise<{ database: ManagedDatabase; deleted: boolean }> {
  const token = requireToken();
  const database = await resolveDatabaseUseCase(nameOrId);
  const data = await gqlRequest<{ deleteManagedDatabase: boolean }>(
    DELETE_MANAGED_DATABASE_MUTATION,
    { id: database.id },
    token,
  );
  return { database, deleted: data.deleteManagedDatabase };
}

export async function restoreDatabaseUseCase(nameOrId: string): Promise<{ database: ManagedDatabase; restored: boolean }> {
  const token = requireToken();
  const database = await resolveDatabaseUseCase(nameOrId);
  const data = await gqlRequest<{ restoreManagedDatabase: boolean }>(
    RESTORE_MANAGED_DATABASE_MUTATION,
    { id: database.id },
    token,
  );
  return { database, restored: data.restoreManagedDatabase };
}
