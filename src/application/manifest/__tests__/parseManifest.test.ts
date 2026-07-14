import { parseManifest, ManifestError } from '../parseManifest';

const DEMO = `
app: zsc-app-demo
services:
  - name: db
    image: postgres:16-alpine
    env:
      - POSTGRES_PASSWORD=secret
      - POSTGRES_DB=app
    volumes:
      - pgdata:/var/lib/postgresql/data
  - name: api
    image: ghcr.io/zeroserver-cc/zsc-app-demo-api:1.0
    env:
      - DATABASE_URL=postgres://postgres:secret@db:5432/app
    ports:
      - "3000"
    dependsOn:
      - db
    exposed: true
`;

describe('parseManifest', () => {
  it('parses the demo multi-service manifest', () => {
    const m = parseManifest(DEMO);
    expect(m.app).toBe('zsc-app-demo');
    expect(m.services).toHaveLength(2);

    const [db, api] = m.services;
    expect(db.name).toBe('db');
    expect(db.image).toBe('postgres:16-alpine');
    expect(db.volumes).toEqual(['pgdata:/var/lib/postgresql/data']);

    expect(api.name).toBe('api');
    expect(api.ports).toEqual(['3000']);
    expect(api.dependsOn).toEqual(['db']);
    expect(api.exposed).toBe(true);
  });

  it('parses a single-service Vite front manifest', () => {
    const m = parseManifest(`
app: meu-front
services:
  - name: web
    image: ghcr.io/me/meu-front:1.0
    ports: ["80"]
    exposed: true
`);
    expect(m.app).toBe('meu-front');
    expect(m.services).toHaveLength(1);
    expect(m.services[0].ports).toEqual(['80']);
  });

  it('coerces numeric ports to strings', () => {
    const m = parseManifest(`
app: a
services:
  - name: web
    image: nginx
    ports:
      - 8080
`);
    expect(m.services[0].ports).toEqual(['8080']);
  });

  it('throws on invalid YAML', () => {
    expect(() => parseManifest('app: : :\n  - bad')).toThrow(ManifestError);
  });

  it('throws when app is missing', () => {
    expect(() => parseManifest('services:\n  - name: a\n    image: b')).toThrow(/"app" is required/);
  });

  it('throws when services is empty', () => {
    expect(() => parseManifest('app: x\nservices: []')).toThrow(/at least one service/);
  });

  it('throws when a service lacks an image', () => {
    expect(() => parseManifest('app: x\nservices:\n  - name: db')).toThrow(/needs an "image"/);
  });

  it('throws when a service lacks a name', () => {
    expect(() => parseManifest('app: x\nservices:\n  - image: nginx')).toThrow(/name is required/);
  });

  it('throws when more than one service is exposed', () => {
    expect(() =>
      parseManifest(`
app: x
services:
  - name: a
    image: nginx
    exposed: true
  - name: b
    image: nginx
    exposed: true
`),
    ).toThrow(/only one service can be "exposed"/);
  });

  it('throws on empty content', () => {
    expect(() => parseManifest('')).toThrow(ManifestError);
  });

  it('throws when a named volume mount path is not absolute', () => {
    expect(() =>
      parseManifest(`
app: x
services:
  - name: db
    image: postgres
    volumes:
      - "data:relative/path"
`),
    ).toThrow(/absolute container path/);
  });

  it('throws on duplicate named volume names across services', () => {
    expect(() =>
      parseManifest(`
app: x
services:
  - name: a
    image: a
    volumes:
      - data:/data
  - name: b
    image: b
    volumes:
      - data:/data
`),
    ).toThrow(/duplicate named volume "data"/);
  });

  it('accepts bind mounts without treating them as named volumes', () => {
    const m = parseManifest(`
app: x
services:
  - name: web
    image: nginx
    volumes:
      - /host/config:/etc/nginx/conf.d:ro
`);
    expect(m.services[0].volumes).toEqual(['/host/config:/etc/nginx/conf.d:ro']);
  });

  it('parses AI requirements', () => {
    const m = parseManifest(`
app: ia-app
ai:
  gpu: true
  llm: true
  video: false
  audio: false
  image: true
services:
  - name: api
    image: ghcr.io/me/ia-api:1.0
    ports: ["8000"]
    exposed: true
`);
    expect(m.ai).toEqual({ gpu: true, llm: true, video: false, audio: false, image: true });
  });

  it('omits AI requirements when not declared', () => {
    const m = parseManifest(DEMO);
    expect(m.ai).toBeUndefined();
  });

  it('throws when ai flags are not boolean', () => {
    expect(() =>
      parseManifest(`
app: x
ai:
  gpu: "yes"
services:
  - name: web
    image: nginx
`),
    ).toThrow(/"ai.gpu" must be true or false/);
  });
});
