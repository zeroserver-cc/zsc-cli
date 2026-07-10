export const LOGIN_MUTATION = `
  mutation Login($input: LoginInput!) {
    login(input: $input) {
      token accessToken refreshToken expiresAt
      user { id username email role }
    }
  }
`;

export const REFRESH_TOKEN_MUTATION = `
  mutation RefreshToken($refreshToken: String!) {
    refreshToken(refreshToken: $refreshToken) {
      token accessToken refreshToken expiresAt
      user { id username email role }
    }
  }
`;

export const ME_QUERY = `
  query Me {
    me { id username email role }
  }
`;

export const CREATE_APPLICATION_MUTATION = `
  mutation CreateApplication($input: CreateApplicationInput!) {
    createApplication(input: $input) {
      id name dockerImage
    }
  }
`;

export const DEPLOY_APPLICATION_MUTATION = `
  mutation DeployApplication($input: DeployApplicationInput!) {
    deployApplication(input: $input) {
      id status externalPort externalIp address applicationId machineId
    }
  }
`;

export const APPLICATION_INSTANCE_QUERY = `
  query ApplicationInstance($id: ID!) {
    applicationInstance(id: $id) {
      id status externalPort externalIp address logs
      application { name }
    }
  }
`;

export const MY_APPLICATIONS_QUERY = `
  query MyApplications {
    myApplications {
      id name dockerImage createdAt
    }
  }
`;

export const APPLICATION_INSTANCES_BY_APP_QUERY = `
  query ApplicationInstancesByApplication($applicationId: ID!) {
    applicationInstancesByApplication(applicationId: $applicationId) {
      id status externalPort externalIp address createdAt
    }
  }
`;

export const STOP_APPLICATION_MUTATION = `
  mutation StopApplication($instanceId: ID!) {
    stopApplication(instanceId: $instanceId) {
      id status
    }
  }
`;

export const REMOVE_APPLICATION_MUTATION = `
  mutation RemoveApplication($instanceId: ID!) {
    removeApplication(instanceId: $instanceId) {
      id status
    }
  }
`;

export const MY_MACHINES_QUERY = `
  query MyMachines {
    myMachines {
      id name status lastHeartbeat createdAt agentVersion
      specs {
        cpu { cores model }
        memory { total available }
        storage { total available }
        os { name version architecture }
      }
    }
  }
`;

export const MACHINE_QUERY = `
  query Machine($id: ID!) {
    machine(id: $id) {
      id name status lastHeartbeat createdAt agentVersion
      specs {
        cpu { cores model frequency }
        memory { total available }
        storage { total available }
        os { name version architecture }
      }
    }
  }
`;

export const INSTANCES_BY_MACHINE_QUERY = `
  query ApplicationInstancesByMachine($machineId: ID!) {
    applicationInstancesByMachine(machineId: $machineId) {
      id status externalPort address createdAt
      application { name dockerImage }
    }
  }
`;

export const CLAIM_MACHINE_MUTATION = `
  mutation ClaimMachine($token: String!) {
    claimMachine(token: $token) {
      id name status createdAt
    }
  }
`;

export const MY_REGISTRY_CREDENTIALS_QUERY = `
  query MyRegistryCredentials {
    myRegistryCredentials {
      registryHost username tokenHint createdAt updatedAt
    }
  }
`;

export const UPSERT_REGISTRY_CREDENTIAL_MUTATION = `
  mutation UpsertRegistryCredential($input: RegistryCredentialInput!) {
    upsertRegistryCredential(input: $input) {
      registryHost username updatedAt
    }
  }
`;

export const DELETE_REGISTRY_CREDENTIAL_MUTATION = `
  mutation DeleteRegistryCredential($registryHost: String!) {
    deleteRegistryCredential(registryHost: $registryHost)
  }
`;

const CUSTOM_DOMAIN_FIELDS = `
  id domain applicationId status verifiedAt createdAt updatedAt
  dnsInstructions { recordType name value }
`;

export const MY_CUSTOM_DOMAINS_QUERY = `
  query MyCustomDomains($applicationId: ID) {
    myCustomDomains(applicationId: $applicationId) {
      ${CUSTOM_DOMAIN_FIELDS}
    }
  }
`;

export const ADD_CUSTOM_DOMAIN_MUTATION = `
  mutation AddCustomDomain($applicationId: ID!, $domain: String!) {
    addCustomDomain(applicationId: $applicationId, domain: $domain) {
      ${CUSTOM_DOMAIN_FIELDS}
    }
  }
`;

export const VERIFY_CUSTOM_DOMAIN_MUTATION = `
  mutation VerifyCustomDomain($id: ID!) {
    verifyCustomDomain(id: $id) {
      ${CUSTOM_DOMAIN_FIELDS}
    }
  }
`;

export const REMOVE_CUSTOM_DOMAIN_MUTATION = `
  mutation RemoveCustomDomain($id: ID!) {
    removeCustomDomain(id: $id)
  }
`;

export const APPLICATION_VOLUMES_QUERY = `
  query ApplicationVolumes($applicationId: ID!) {
    applicationVolumes(applicationId: $applicationId) {
      id name mountPath serviceName nodeId lastSnapshotAt lastSnapshotKey createdAt updatedAt
    }
  }
`;

export const RESTORE_APPLICATION_VOLUMES_MUTATION = `
  mutation RestoreApplicationVolumes($applicationId: ID!) {
    restoreApplicationVolumes(applicationId: $applicationId) {
      commandIds targetMachineId
    }
  }
`;
