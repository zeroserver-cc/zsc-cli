import { Machine } from '../../domain/entities/types';
import { gqlRequest } from '../../infrastructure/graphql/client';
import { MY_MACHINES_QUERY } from '../../infrastructure/graphql/queries';
import { getConfigValue } from '../../infrastructure/config/store';
import { formatDate } from '../../presentation/formatting/dates';

export interface MachineRow {
  id: string;
  name: string;
  status: string;
  cpu: string;
  memoryGb: string;
  os: string;
  agentVersion: string;
  lastSeen: string;
}

export async function listMachinesUseCase(): Promise<MachineRow[]> {
  const token = getConfigValue('accessToken');
  if (!token) throw new Error('Not logged in. Run "zs login" first.');

  const data = await gqlRequest<{ myMachines: Machine[] }>(MY_MACHINES_QUERY, undefined, token);

  return data.myMachines.map((m) => ({
    id: m.id,
    name: m.name,
    status: m.status,
    cpu: m.specs ? `${m.specs.cpu.cores}c – ${m.specs.cpu.model}` : '-',
    memoryGb: m.specs
      ? `${Math.round(m.specs.memory.available / 1024)}/${Math.round(m.specs.memory.total / 1024)} GB`
      : '-',
    os: m.specs ? `${m.specs.os.name} ${m.specs.os.version}` : '-',
    agentVersion: m.agentVersion || '-',
    lastSeen: m.lastHeartbeat ? formatDate(m.lastHeartbeat) : 'never',
  }));
}

