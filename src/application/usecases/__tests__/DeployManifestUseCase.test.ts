import path from 'path';
import fs from 'fs';
import os from 'os';
import { deployManifestUseCase } from '../DeployManifestUseCase';
import { gqlRequest } from '../../../infrastructure/graphql/client';
import { getConfigValue } from '../../../infrastructure/config/store';
import { waitForInstance } from '../waitForInstance';
import {
  CREATE_APPLICATION_MUTATION,
  DEPLOY_APPLICATION_MUTATION,
  MY_APPLICATIONS_QUERY,
  MY_DATABASES_QUERY,
  UPDATE_APPLICATION_MUTATION,
} from '../../../infrastructure/graphql/queries';

jest.mock('../../../infrastructure/graphql/client');
jest.mock('../../../infrastructure/config/store');
jest.mock('../waitForInstance');

const mockGql = gqlRequest as jest.MockedFunction<typeof gqlRequest>;

let tmpDir: string;

beforeEach(() => {
  jest.clearAllMocks();
  (getConfigValue as jest.Mock).mockReturnValue('a-token');
  (waitForInstance as jest.Mock).mockResolvedValue({
    instance: { id: 'inst-1', status: 'RUNNING' },
    timedOut: false,
  });
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zsc-cli-deploy-manifest-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const writeManifest = (content: string) => {
  fs.writeFileSync(path.join(tmpDir, 'zs.yaml'), content, 'utf-8');
};

const deployOk = { deployApplication: { id: 'inst-1', status: 'PENDING' } };

it('creates the application the first time when none matches the manifest name', async () => {
  writeManifest(`
app: demo-app
services:
  - name: web
    image: nginx
    ports: ["80"]
    exposed: true
`);

  mockGql.mockImplementation(async (query: string) => {
    if (query === MY_APPLICATIONS_QUERY) return { myApplications: [] } as any;
    if (query === CREATE_APPLICATION_MUTATION) return { createApplication: { id: 'app-new' } } as any;
    if (query === DEPLOY_APPLICATION_MUTATION) return deployOk as any;
    throw new Error(`unexpected query: ${query}`);
  });

  const result = await deployManifestUseCase(tmpDir);

  expect(mockGql.mock.calls.map((c) => c[0])).toContain(CREATE_APPLICATION_MUTATION);
  expect(mockGql.mock.calls.map((c) => c[0])).not.toContain(UPDATE_APPLICATION_MUTATION);
  const deployVars = mockGql.mock.calls.find((c) => c[0] === DEPLOY_APPLICATION_MUTATION)![1] as any;
  expect(deployVars.input.applicationId).toBe('app-new');
  expect(result.manifest.app).toBe('demo-app');
});

it('syncs the composition via updateApplication before redeploying an existing app', async () => {
  writeManifest(`
app: demo-app
services:
  - name: web
    image: nginx:1.27
    env: ["MODE=prod"]
    ports: ["8080:80"]
    exposed: true
  - name: worker
    image: ghcr.io/me/worker:2.0
    dependsOn: ["web"]
`);

  mockGql.mockImplementation(async (query: string) => {
    if (query === MY_APPLICATIONS_QUERY) return { myApplications: [{ id: 'app-42', name: 'demo-app' }] } as any;
    if (query === UPDATE_APPLICATION_MUTATION) return { updateApplication: { id: 'app-42', name: 'demo-app' } } as any;
    if (query === DEPLOY_APPLICATION_MUTATION) return deployOk as any;
    throw new Error(`unexpected query: ${query}`);
  });

  const result = await deployManifestUseCase(tmpDir);

  const calledQueries = mockGql.mock.calls.map((c) => c[0]);
  expect(calledQueries).not.toContain(CREATE_APPLICATION_MUTATION);
  expect(calledQueries.indexOf(UPDATE_APPLICATION_MUTATION)).toBeGreaterThanOrEqual(0);
  expect(calledQueries.indexOf(UPDATE_APPLICATION_MUTATION)).toBeLessThan(
    calledQueries.indexOf(DEPLOY_APPLICATION_MUTATION),
  );

  const updateVars = mockGql.mock.calls.find((c) => c[0] === UPDATE_APPLICATION_MUTATION)![1] as any;
  expect(updateVars.id).toBe('app-42');
  expect(updateVars.input.name).toBe('demo-app');
  expect(updateVars.input.services).toEqual(result.manifest.services);
  expect(updateVars.input).not.toHaveProperty('config');

  const deployVars = mockGql.mock.calls.find((c) => c[0] === DEPLOY_APPLICATION_MUTATION)![1] as any;
  expect(deployVars.input.applicationId).toBe('app-42');
  expect(result.manifest.app).toBe('demo-app');
});

it('forwards AI requirements to the deploy input', async () => {
  writeManifest(`
app: ai-app
ai:
  gpu: true
  llm: false
services:
  - name: api
    image: ghcr.io/me/ai-api:1.0
    ports: ["8000"]
    exposed: true
`);

  mockGql.mockImplementation(async (query: string) => {
    if (query === MY_APPLICATIONS_QUERY) return { myApplications: [] } as any;
    if (query === CREATE_APPLICATION_MUTATION) return { createApplication: { id: 'app-ai' } } as any;
    if (query === DEPLOY_APPLICATION_MUTATION) return deployOk as any;
    throw new Error(`unexpected query: ${query}`);
  });

  await deployManifestUseCase(tmpDir);

  const deployVars = mockGql.mock.calls.find((c) => c[0] === DEPLOY_APPLICATION_MUTATION)![1] as any;
  expect(deployVars.input).toMatchObject({
    applicationId: 'app-ai',
    requiresGpu: true,
    requiresLlm: false,
  });
});

it('forwards the manifest placement uppercased as preferredCountry/preferredRegion', async () => {
  writeManifest(`
app: geo-app
placement:
  country: br
  region: rs
services:
  - name: web
    image: nginx
    exposed: true
`);

  mockGql.mockImplementation(async (query: string) => {
    if (query === MY_APPLICATIONS_QUERY) return { myApplications: [{ id: 'app-42', name: 'geo-app' }] } as any;
    if (query === UPDATE_APPLICATION_MUTATION) return { updateApplication: { id: 'app-42', name: 'geo-app' } } as any;
    if (query === DEPLOY_APPLICATION_MUTATION) return deployOk as any;
    throw new Error(`unexpected query: ${query}`);
  });

  const result = await deployManifestUseCase(tmpDir);

  const deployVars = mockGql.mock.calls.find((c) => c[0] === DEPLOY_APPLICATION_MUTATION)![1] as any;
  expect(deployVars.input.preferredCountry).toBe('BR');
  expect(deployVars.input.preferredRegion).toBe('RS');
  expect(result.placement).toEqual({ country: 'BR', region: 'RS' });
});

it('lets CLI flag overrides win over the manifest placement per field', async () => {
  writeManifest(`
app: geo-app
placement:
  country: BR
  region: RS
services:
  - name: web
    image: nginx
    exposed: true
`);

  mockGql.mockImplementation(async (query: string) => {
    if (query === MY_APPLICATIONS_QUERY) return { myApplications: [{ id: 'app-42', name: 'geo-app' }] } as any;
    if (query === UPDATE_APPLICATION_MUTATION) return { updateApplication: { id: 'app-42', name: 'geo-app' } } as any;
    if (query === DEPLOY_APPLICATION_MUTATION) return deployOk as any;
    throw new Error(`unexpected query: ${query}`);
  });

  const result = await deployManifestUseCase(tmpDir, undefined, { placement: { country: 'US' } });

  const deployVars = mockGql.mock.calls.find((c) => c[0] === DEPLOY_APPLICATION_MUTATION)![1] as any;
  expect(deployVars.input.preferredCountry).toBe('US');
  expect(deployVars.input.preferredRegion).toBe('RS');
  expect(result.placement).toEqual({ country: 'US', region: 'RS' });
});

it('omits the placement fields when the manifest declares none', async () => {
  writeManifest(`
app: demo-app
services:
  - name: web
    image: nginx
    exposed: true
`);

  mockGql.mockImplementation(async (query: string) => {
    if (query === MY_APPLICATIONS_QUERY) return { myApplications: [{ id: 'app-42', name: 'demo-app' }] } as any;
    if (query === UPDATE_APPLICATION_MUTATION) return { updateApplication: { id: 'app-42', name: 'demo-app' } } as any;
    if (query === DEPLOY_APPLICATION_MUTATION) return deployOk as any;
    throw new Error(`unexpected query: ${query}`);
  });

  const result = await deployManifestUseCase(tmpDir);

  const deployVars = mockGql.mock.calls.find((c) => c[0] === DEPLOY_APPLICATION_MUTATION)![1] as any;
  expect(deployVars.input).not.toHaveProperty('preferredCountry');
  expect(deployVars.input).not.toHaveProperty('preferredRegion');
  expect(result.placement).toBeUndefined();
});

it('sends the envFile-merged env to createApplication (envFile first, zs.yaml env last)', async () => {
  fs.writeFileSync(path.join(tmpDir, '.env'), 'FOO=from-file\nBAR=file\n');
  writeManifest(`
app: env-app
services:
  - name: api
    image: ghcr.io/me/api:1.0
    envFile: .env
    env:
      - BAR=yaml
    exposed: true
`);

  mockGql.mockImplementation(async (query: string) => {
    if (query === MY_APPLICATIONS_QUERY) return { myApplications: [] } as any;
    if (query === CREATE_APPLICATION_MUTATION) return { createApplication: { id: 'app-env' } } as any;
    if (query === DEPLOY_APPLICATION_MUTATION) return deployOk as any;
    throw new Error(`unexpected query: ${query}`);
  });

  const result = await deployManifestUseCase(tmpDir);

  const createVars = mockGql.mock.calls.find((c) => c[0] === CREATE_APPLICATION_MUTATION)![1] as any;
  expect(createVars.input.services[0].env).toEqual(['FOO=from-file', 'BAR=yaml']);
  expect(createVars.input.services[0]).not.toHaveProperty('envFile');
  expect(result.warnings).toEqual([]);
});

it('warns about a missing envFile and continues the deploy without those vars', async () => {
  writeManifest(`
app: env-app
services:
  - name: api
    image: ghcr.io/me/api:1.0
    envFile: .env.local
    env:
      - A=1
    exposed: true
`);

  mockGql.mockImplementation(async (query: string) => {
    if (query === MY_APPLICATIONS_QUERY) return { myApplications: [] } as any;
    if (query === CREATE_APPLICATION_MUTATION) return { createApplication: { id: 'app-env' } } as any;
    if (query === DEPLOY_APPLICATION_MUTATION) return deployOk as any;
    throw new Error(`unexpected query: ${query}`);
  });

  const progress: string[] = [];
  const result = await deployManifestUseCase(tmpDir, (status) => progress.push(status));

  const expectedWarning = "zs.yaml: envFile '.env.local' not found for service 'api'; skipping";
  expect(result.warnings).toEqual([expectedWarning]);
  expect(progress).toContain(expectedWarning);

  const createVars = mockGql.mock.calls.find((c) => c[0] === CREATE_APPLICATION_MUTATION)![1] as any;
  expect(createVars.input.services[0].env).toEqual(['A=1']);
  expect(mockGql.mock.calls.map((c) => c[0])).toContain(DEPLOY_APPLICATION_MUTATION);
});

it('resolves the manifest "database" name to a databaseId on the deploy input', async () => {
  writeManifest(`
app: db-app
database: app-db
services:
  - name: api
    image: ghcr.io/me/api:1.0
    exposed: true
`);

  mockGql.mockImplementation(async (query: string) => {
    if (query === MY_APPLICATIONS_QUERY) return { myApplications: [] } as any;
    if (query === CREATE_APPLICATION_MUTATION) return { createApplication: { id: 'app-db-1' } } as any;
    if (query === MY_DATABASES_QUERY) {
      return { myDatabases: [{ id: 'db-1', name: 'app-db', engine: 'POSTGRES', status: 'RUNNING' }] } as any;
    }
    if (query === DEPLOY_APPLICATION_MUTATION) return deployOk as any;
    throw new Error(`unexpected query: ${query}`);
  });

  await deployManifestUseCase(tmpDir);

  const deployVars = mockGql.mock.calls.find((c) => c[0] === DEPLOY_APPLICATION_MUTATION)![1] as any;
  expect(deployVars.input.databaseId).toBe('db-1');
});

it('fails the deploy with a clear error when the manifest database does not exist', async () => {
  writeManifest(`
app: db-app
database: missing-db
services:
  - name: api
    image: ghcr.io/me/api:1.0
    exposed: true
`);

  mockGql.mockImplementation(async (query: string) => {
    if (query === MY_APPLICATIONS_QUERY) return { myApplications: [] } as any;
    if (query === CREATE_APPLICATION_MUTATION) return { createApplication: { id: 'app-db-1' } } as any;
    if (query === MY_DATABASES_QUERY) return { myDatabases: [] } as any;
    if (query === DEPLOY_APPLICATION_MUTATION) return deployOk as any;
    throw new Error(`unexpected query: ${query}`);
  });

  await expect(deployManifestUseCase(tmpDir)).rejects.toThrow(/Unknown database "missing-db"/);
  expect(mockGql.mock.calls.map((c) => c[0])).not.toContain(DEPLOY_APPLICATION_MUTATION);
});

it('omits databaseId when the manifest declares no database, preserving the persisted attach', async () => {
  writeManifest(`
app: demo-app
services:
  - name: web
    image: nginx
    exposed: true
`);

  mockGql.mockImplementation(async (query: string) => {
    if (query === MY_APPLICATIONS_QUERY) return { myApplications: [{ id: 'app-42', name: 'demo-app' }] } as any;
    if (query === UPDATE_APPLICATION_MUTATION) return { updateApplication: { id: 'app-42', name: 'demo-app' } } as any;
    if (query === DEPLOY_APPLICATION_MUTATION) return deployOk as any;
    throw new Error(`unexpected query: ${query}`);
  });

  await deployManifestUseCase(tmpDir);

  const deployVars = mockGql.mock.calls.find((c) => c[0] === DEPLOY_APPLICATION_MUTATION)![1] as any;
  expect(deployVars.input).not.toHaveProperty('databaseId');
  expect(mockGql.mock.calls.map((c) => c[0])).not.toContain(MY_DATABASES_QUERY);
});
