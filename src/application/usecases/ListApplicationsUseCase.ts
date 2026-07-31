import { Application, ApplicationInstance } from '../../domain/entities/types';
import { gqlRequest } from '../../infrastructure/graphql/client';
import {
  MY_APPLICATIONS_QUERY,
  APPLICATION_INSTANCES_BY_APP_QUERY,
} from '../../infrastructure/graphql/queries';
import { getConfigValue } from '../../infrastructure/config/store';

export interface AppRow {
  instanceId: string;
  appName: string;
  image: string;
  status: string;
  address: string;
}

// Terminal instance states; anything else counts as live when picking the
// single row shown per app.
const DEAD_INSTANCE_STATUSES = new Set(['STOPPED', 'ERROR', 'FAILED']);

export async function listApplicationsUseCase(): Promise<AppRow[]> {
  const token = getConfigValue('accessToken');
  if (!token) throw new Error('Not logged in. Run "zs login" first.');

  const appsData = await gqlRequest<{ myApplications: Application[] }>(
    MY_APPLICATIONS_QUERY,
    undefined,
    token,
  );
  const apps = appsData.myApplications;
  if (!apps.length) return [];

  const rows: AppRow[] = [];

  await Promise.all(
    apps.map(async (app) => {
      const instData = await gqlRequest<{ applicationInstancesByApplication: ApplicationInstance[] }>(
        APPLICATION_INSTANCES_BY_APP_QUERY,
        { applicationId: app.id },
        token,
      );
      // Stable-instance model: apps keep ONE instance. Historical dead
      // instances may still come back from older data, so collapse to a single
      // row per app: prefer the newest live instance, falling back to the
      // newest overall so a stopped app still shows its STOPPED row.
      const instances = instData.applicationInstancesByApplication;
      const live = instances.filter((inst) => !DEAD_INSTANCE_STATUSES.has(inst.status));
      const picked = (live.length > 0 ? live : instances)
        .slice()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      if (picked) {
        rows.push({
          instanceId: picked.id,
          appName: app.name,
          image: app.dockerImage,
          status: picked.status,
          address: app.address ?? app.publicUrl ?? picked.address ?? '-',
        });
      }
    }),
  );

  return rows;
}
