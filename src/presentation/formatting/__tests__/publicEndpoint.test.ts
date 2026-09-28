import { publicEndpointSummary } from '../publicEndpoint';
import { ManagedDatabase } from '../../../domain/entities/types';

function database(overrides: Partial<ManagedDatabase>): ManagedDatabase {
  return {
    id: 'db-1',
    name: 'app-db',
    engine: 'POSTGRES',
    version: '16',
    status: 'RUNNING',
    machineId: 'machine-1',
    lastDumpAt: null,
    replicas: [],
    publicAccess: false,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides
  };
}

describe('publicEndpointSummary', () => {
  it('shows - when the database is not exposed', () => {
    expect(publicEndpointSummary(database({}))).toBe('-');
  });

  it('shows the gateway host:port when exposed', () => {
    expect(
      publicEndpointSummary(
        database({ publicAccess: true, publicHost: 'db.zeroserver.cc', publicPort: 15432 })
      )
    ).toBe('db.zeroserver.cc:15432');
  });

  it('shows a pending hint when exposed without an allocated endpoint yet', () => {
    expect(publicEndpointSummary(database({ publicAccess: true }))).toBe('pending');
    expect(
      publicEndpointSummary(database({ publicAccess: true, publicHost: 'db.zeroserver.cc' }))
    ).toBe('pending');
  });
});
