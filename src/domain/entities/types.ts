export type UserRole = 'admin' | 'provider' | 'developer';

export interface User {
  id: string;
  username: string;
  email: string;
  role: UserRole;
}

export interface AuthPayload {
  token: string;
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
  application?: { name: string };
}

export interface DeployInput {
  image: string;
  name?: string;
  port?: number;
  env?: string[];
}
