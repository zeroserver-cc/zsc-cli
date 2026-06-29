import { manifestToCreateInput } from '../toCreateInput';
import { AppManifest } from '../../../domain/entities/types';

describe('manifestToCreateInput', () => {
  it('maps a manifest to the backend createApplication input', () => {
    const manifest: AppManifest = {
      app: 'zsc-app-demo',
      services: [
        { name: 'db', image: 'postgres:16-alpine', volumes: ['pgdata:/var/lib/postgresql/data'] },
        { name: 'api', image: 'ghcr.io/x/api:1.0', ports: ['3000'], dependsOn: ['db'], exposed: true },
      ],
    };

    const input = manifestToCreateInput(manifest);

    expect(input.name).toBe('zsc-app-demo');
    expect(input.config).toEqual({});
    // services pass through unchanged: same shape as ServiceDefinitionInput.
    expect(input.services).toBe(manifest.services);
    expect(input.services[1]).toMatchObject({
      name: 'api',
      image: 'ghcr.io/x/api:1.0',
      ports: ['3000'],
      dependsOn: ['db'],
      exposed: true,
    });
  });
});
