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
  const deployVars = mockGql.mock.calls.find((c) => c[0] === DEPLOY_APPLICATION_MUTATION)![1] as any;
  expect(deployVars.input.applicationId).toBe('app-new');
  expect(result.manifest.app).toBe('demo-app');
});

it('reuses an existing application by manifest name without creating a new one', async () => {
  writeManifest(`
app: demo-app
services:
  - name: web
    image: nginx
    ports: ["80"]
    exposed: true
`);

  mockGql.mockImplementation(async (query: string) => {
    if (query === MY_APPLICATIONS_QUERY) return { myApplications: [{ id: 'app-42', name: 'demo-app' }] } as any;
    if (query === DEPLOY_APPLICATION_MUTATION) return deployOk as any;
    throw new Error(`unexpected query: ${query}`);
  });

  const result = await deployManifestUseCase(tmpDir);

  expect(mockGql.mock.calls.map((c) => c[0])).not.toContain(CREATE_APPLICATION_MUTATION);
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
    if (query === DEPLOY_APPLICATION_MUTATION) return deployOk as any;
    throw new Error(`unexpected query: ${query}`);
  });

  const result = await deployManifestUseCase(tmpDir);

  const deployVars = mockGql.mock.calls.find((c) => c[0] === DEPLOY_APPLICATION_MUTATION)![1] as any;
  expect(deployVars.input).not.toHaveProperty('preferredCountry');
  expect(deployVars.input).not.toHaveProperty('preferredRegion');
  expect(result.placement).toBeUndefined();
});
