import { Application, CustomDomain } from '../../domain/entities/types';
import { gqlRequest } from '../../infrastructure/graphql/client';
import {
  MY_APPLICATIONS_QUERY,
  MY_CUSTOM_DOMAINS_QUERY,
  ADD_CUSTOM_DOMAIN_MUTATION,
  VERIFY_CUSTOM_DOMAIN_MUTATION,
  REMOVE_CUSTOM_DOMAIN_MUTATION,
} from '../../infrastructure/graphql/queries';
import { getConfigValue } from '../../infrastructure/config/store';

function requireToken(): string {
  const token = getConfigValue('token');
  if (!token) throw new Error('Not logged in. Run "zs login" first.');
  return token;
}

// The backend stores domains normalized (lowercase, trimmed); normalize both
// user input and API values before comparing or sending, so casing/whitespace
// never causes a claim/lookup mismatch.
function normalizeDomainInput(domain: string): string {
  return domain.trim().toLowerCase();
}

// Domains attach to an application, but developers think in app names —
// resolve the name to the id the API wants.
async function resolveApplicationByName(name: string, token: string): Promise<Application> {
  const data = await gqlRequest<{ myApplications: Application[] }>(MY_APPLICATIONS_QUERY, undefined, token);
  const app = data.myApplications.find((a) => a.name === name);
  if (!app) {
    const names = data.myApplications.map((a) => a.name).join(', ') || '(none)';
    throw new Error(`Application "${name}" not found. Your applications: ${names}`);
  }
  return app;
}

export async function domainAddUseCase(domain: string, appName: string): Promise<CustomDomain> {
  const token = requireToken();
  const app = await resolveApplicationByName(appName, token);
  const data = await gqlRequest<{ addCustomDomain: CustomDomain }>(
    ADD_CUSTOM_DOMAIN_MUTATION,
    { applicationId: app.id, domain: normalizeDomainInput(domain) },
    token,
  );
  return data.addCustomDomain;
}

export async function domainListUseCase(appName?: string): Promise<CustomDomain[]> {
  const token = requireToken();
  const applicationId = appName ? (await resolveApplicationByName(appName, token)).id : undefined;
  const data = await gqlRequest<{ myCustomDomains: CustomDomain[] }>(
    MY_CUSTOM_DOMAINS_QUERY,
    { applicationId },
    token,
  );
  return data.myCustomDomains;
}

async function findByDomainName(domain: string, token: string): Promise<CustomDomain> {
  const wanted = normalizeDomainInput(domain);
  const data = await gqlRequest<{ myCustomDomains: CustomDomain[] }>(MY_CUSTOM_DOMAINS_QUERY, {}, token);
  const record = data.myCustomDomains.find((d) => normalizeDomainInput(d.domain) === wanted);
  if (!record) {
    throw new Error(`Domain "${wanted}" not found. Add it with "zs domain add ${wanted} --app <name>".`);
  }
  return record;
}

export async function domainVerifyUseCase(domain: string): Promise<CustomDomain> {
  const token = requireToken();
  const record = await findByDomainName(domain, token);
  const data = await gqlRequest<{ verifyCustomDomain: CustomDomain }>(
    VERIFY_CUSTOM_DOMAIN_MUTATION,
    { id: record.id },
    token,
  );
  return data.verifyCustomDomain;
}

export async function domainRemoveUseCase(domain: string): Promise<boolean> {
  const token = requireToken();
  const record = await findByDomainName(domain, token);
  const data = await gqlRequest<{ removeCustomDomain: boolean }>(
    REMOVE_CUSTOM_DOMAIN_MUTATION,
    { id: record.id },
    token,
  );
  return data.removeCustomDomain;
}
