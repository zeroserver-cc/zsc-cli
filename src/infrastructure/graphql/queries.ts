export const LOGIN_MUTATION = `
  mutation Login($input: LoginInput!) {
    login(input: $input) {
      token expiresAt
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
