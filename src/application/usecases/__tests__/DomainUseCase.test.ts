import {
  domainAddUseCase,
  domainListUseCase,
  domainVerifyUseCase,
  domainRemoveUseCase,
} from '../DomainUseCase';
import { gqlRequest } from '../../../infrastructure/graphql/client';
import { getConfigValue } from '../../../infrastructure/config/store';
import {
  MY_APPLICATIONS_QUERY,
  MY_CUSTOM_DOMAINS_QUERY,
  ADD_CUSTOM_DOMAIN_MUTATION,
  VERIFY_CUSTOM_DOMAIN_MUTATION,
  REMOVE_CUSTOM_DOMAIN_MUTATION,
} from '../../../infrastructure/graphql/queries';

jest.mock('../../../infrastructure/graphql/client');
jest.mock('../../../infrastructure/config/store');

const mockGql = gqlRequest as jest.MockedFunction<typeof gqlRequest>;

const record = {
  id: 'cd-1',
  domain: 'www.acme.com',
  applicationId: 'app-42',
  status: 'PENDING',
  dnsInstructions: [{ recordType: 'TXT', name: '_zsc-verify.www.acme.com', value: 'zsc-verify=abc' }],
};

beforeEach(() => {
  jest.clearAllMocks();
  (getConfigValue as jest.Mock).mockReturnValue('a-token');
});

it('add resolves the application by name and sends its id', async () => {
  mockGql.mockImplementation(async (query: string) => {
    if (query === MY_APPLICATIONS_QUERY) return { myApplications: [{ id: 'app-42', name: 'site' }] } as any;
    if (query === ADD_CUSTOM_DOMAIN_MUTATION) return { addCustomDomain: record } as any;
    throw new Error(`unexpected query: ${query}`);
  });

  const result = await domainAddUseCase('www.acme.com', 'site');

  const addVars = mockGql.mock.calls.find((c) => c[0] === ADD_CUSTOM_DOMAIN_MUTATION)![1] as any;
  expect(addVars).toEqual({ applicationId: 'app-42', domain: 'www.acme.com' });
  expect(result.dnsInstructions).toHaveLength(1);
});

it('add fails with the available app names when the app does not exist', async () => {
  mockGql.mockImplementation(async (query: string) => {
    if (query === MY_APPLICATIONS_QUERY) return { myApplications: [{ id: 'a1', name: 'other' }] } as any;
    throw new Error(`unexpected query: ${query}`);
  });

  await expect(domainAddUseCase('www.acme.com', 'site')).rejects.toThrow(/not found.*other/);
});

it('list forwards the resolved applicationId filter', async () => {
  mockGql.mockImplementation(async (query: string) => {
    if (query === MY_APPLICATIONS_QUERY) return { myApplications: [{ id: 'app-42', name: 'site' }] } as any;
    if (query === MY_CUSTOM_DOMAINS_QUERY) return { myCustomDomains: [record] } as any;
    throw new Error(`unexpected query: ${query}`);
  });

  const result = await domainListUseCase('site');

  const listVars = mockGql.mock.calls.find((c) => c[0] === MY_CUSTOM_DOMAINS_QUERY)![1] as any;
  expect(listVars).toEqual({ applicationId: 'app-42' });
  expect(result).toHaveLength(1);
});

it('verify finds the record by (normalized) domain name and mutates by id', async () => {
  mockGql.mockImplementation(async (query: string) => {
    if (query === MY_CUSTOM_DOMAINS_QUERY) return { myCustomDomains: [record] } as any;
    if (query === VERIFY_CUSTOM_DOMAIN_MUTATION) {
      return { verifyCustomDomain: { ...record, status: 'ACTIVE' } } as any;
    }
    throw new Error(`unexpected query: ${query}`);
  });

  const result = await domainVerifyUseCase('WWW.Acme.com ');

  const verifyVars = mockGql.mock.calls.find((c) => c[0] === VERIFY_CUSTOM_DOMAIN_MUTATION)![1] as any;
  expect(verifyVars).toEqual({ id: 'cd-1' });
  expect(result.status).toBe('ACTIVE');
});

it('remove resolves by domain name and returns the API result', async () => {
  mockGql.mockImplementation(async (query: string) => {
    if (query === MY_CUSTOM_DOMAINS_QUERY) return { myCustomDomains: [record] } as any;
    if (query === REMOVE_CUSTOM_DOMAIN_MUTATION) return { removeCustomDomain: true } as any;
    throw new Error(`unexpected query: ${query}`);
  });

  await expect(domainRemoveUseCase('www.acme.com')).resolves.toBe(true);
});

it('verify fails with guidance when the domain is unknown', async () => {
  mockGql.mockImplementation(async (query: string) => {
    if (query === MY_CUSTOM_DOMAINS_QUERY) return { myCustomDomains: [] } as any;
    throw new Error(`unexpected query: ${query}`);
  });

  await expect(domainVerifyUseCase('nope.com')).rejects.toThrow(/zs domain add/);
});

it('all commands require a login token', async () => {
  (getConfigValue as jest.Mock).mockReturnValue(undefined);
  await expect(domainListUseCase()).rejects.toThrow(/Not logged in/);
});
