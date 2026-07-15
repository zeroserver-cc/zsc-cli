export type UserRole = 'admin' | 'provider' | 'developer';

export interface User {
  id: string;
  username: string;
  email: string;
  role: UserRole;
}

export interface AuthPayload {
  token: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  user: User;
}

export type ApplicationInstanceStatus =
  | 'PENDING'
  | 'STARTING'
  | 'RUNNING'
  | 'STOPPING'
  | 'STOPPED'
  | 'ERROR'
  | 'FAILED';

export interface Application {
  id: string;
  name: string;
  dockerImage: string;
  publicUrl?: string;
  address?: string;
  createdAt: string;
}

export interface ApplicationInstance {
  id: string;
  applicationId: string;
  status: ApplicationInstanceStatus;
  externalPort?: number;
  externalIp?: string;
  address?: string;
  logs?: string;
  createdAt: string;
  application?: Application;
}

export interface DeployInput {
  image: string;
  name?: string;
  appId?: string;
  port?: number;
  env?: string[];
}

/** AI/ML resources declared by the application. */
export interface ManifestAIRequirements {
  gpu?: boolean;
  llm?: boolean;
  video?: boolean;
  audio?: boolean;
  image?: boolean;
}

// A single service (container) in a zs.yaml manifest. Maps 1:1 to the backend's
// ServiceDefinitionInput consumed by createApplication.
export interface ManifestService {
  name: string;
  image: string;
  env?: string[];
  ports?: string[];
  volumes?: string[];
  dependsOn?: string[];
  exposed?: boolean;
}

// Parsed and validated zs.yaml manifest (multi-service application).
export interface AppManifest {
  app: string;
  ai?: ManifestAIRequirements;
  services: ManifestService[];
}

export type MachineStatus = 'OFFLINE' | 'REGISTERING' | 'IDLE' | 'BUSY' | 'OVERLOADED' | 'ONLINE';

export interface MachineSpecs {
  cpu: { cores: number; model: string; frequency?: string };
  memory: { total: number; available: number };
  storage: { total: number; available: number };
  os: { name: string; version: string; architecture: string };
}

export interface Machine {
  id: string;
  name: string;
  status: MachineStatus;
  specs?: MachineSpecs;
  lastHeartbeat?: string;
  agentVersion?: string;
  createdAt: string;
}

export interface ApplicationVolume {
  id: string;
  applicationId: string;
  name: string;
  mountPath: string;
  serviceName: string;
  nodeId?: string;
  lastSnapshotAt?: string;
  lastSnapshotKey?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RegistryCredential {
  registryHost: string;
  username: string;
  // Last 4 chars of the token, for display only. Null for credentials saved
  // before this field existed, or for tokens shorter than 8 chars.
  tokenHint?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface DnsInstruction {
  recordType: 'TXT' | 'CNAME' | 'A';
  name: string;
  value: string;
}

export type CustomDomainStatus = 'PENDING' | 'VERIFIED' | 'ACTIVE' | 'FAILED';

export interface CustomDomain {
  id: string;
  domain: string;
  applicationId: string;
  status: CustomDomainStatus;
  dnsInstructions: DnsInstruction[];
  verifiedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}
