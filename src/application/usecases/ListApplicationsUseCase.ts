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

export async function listApplicationsUseCase(): Promise<AppRow[]> {
  const token = getConfigValue('token');
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
      for (const inst of instData.applicationInstancesByApplication) {
        rows.push({
          instanceId: inst.id,
          appName: app.name,
          image: app.dockerImage,
          status: inst.status,
          address: inst.address ?? '-',
        });
      }
    }),
  );

  return rows;
}
