import { Machine, ApplicationInstance } from '../../domain/entities/types';
import { gqlRequest } from '../../infrastructure/graphql/client';
import { MACHINE_QUERY, INSTANCES_BY_MACHINE_QUERY } from '../../infrastructure/graphql/queries';
import { getConfigValue } from '../../infrastructure/config/store';

export interface MachineDetail {
  machine: Machine;
  instances: (ApplicationInstance & { application?: { name: string; dockerImage: string } })[];
}

export async function getMachineUseCase(id: string): Promise<MachineDetail> {
  const token = getConfigValue('accessToken');
  if (!token) throw new Error('Not logged in. Run "zs login" first.');

  const [machineData, instancesData] = await Promise.all([
    gqlRequest<{ machine: Machine | null }>(MACHINE_QUERY, { id }, token),
    gqlRequest<{ applicationInstancesByMachine: MachineDetail['instances'] }>(
      INSTANCES_BY_MACHINE_QUERY,
      { machineId: id },
      token,
    ),
  ]);

  if (!machineData.machine) throw new Error(`Node "${id}" not found.`);

  return {
    machine: machineData.machine,
    instances: instancesData.applicationInstancesByMachine,
  };
}
