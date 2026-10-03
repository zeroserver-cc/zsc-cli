import { deployReplicaLines, replicaReportLines } from '../replicaReport';
import { ReplicaStatus } from '../../../domain/entities/types';

const strip = (lines: string[]) => lines.join('\n');

const status = (partial: Partial<ReplicaStatus>): ReplicaStatus => ({
  desiredReplicas: 3,
  effectiveReplicas: 3,
  runningReplicas: 3,
  replicaWarnings: [],
  ...partial
});

describe('replicaReportLines', () => {
  it('shows requested, effective and running counts', () => {
    const text = strip(replicaReportLines(status({ runningReplicas: 3 })));

    expect(text).toContain('3 requested, 3 effective, 3 running');
    expect(text).not.toContain('start in the background');
  });

  it('says the missing replicas are still starting', () => {
    const text = strip(replicaReportLines(status({ runningReplicas: 1 })));

    expect(text).toContain(
      '3 requested, 3 effective, 1 running (the others start in the background)'
    );
  });

  it('prints the cost and the stateless requirement when more than one replica runs', () => {
    const text = strip(replicaReportLines(status({ effectiveReplicas: 3 })));

    expect(text).toContain('3 replicas cost 3 x the per-instance hourly price');
    expect(text).toContain('no sticky sessions');
    expect(text).toContain('signed cookie or an external database');
  });

  it('prints the platform warnings and skips the cost note when held at one replica', () => {
    const text = strip(
      replicaReportLines(
        status({
          effectiveReplicas: 1,
          runningReplicas: 1,
          replicaWarnings: ['Apps with volumes keep a single replica.']
        })
      )
    );

    expect(text).toContain('3 requested, 1 effective, 1 running');
    expect(text).toContain('Warning: Apps with volumes keep a single replica.');
    expect(text).not.toContain('cost');
    expect(text).not.toContain('sticky');
  });

  it('uses the effective count in the cost note when the platform capped the request', () => {
    const text = strip(
      replicaReportLines(
        status({
          desiredReplicas: 8,
          effectiveReplicas: 5,
          runningReplicas: 5,
          replicaWarnings: ['Capped at 5 replicas per app.']
        })
      )
    );

    expect(text).toContain('5 replicas cost 5 x');
    expect(text).toContain('Warning: Capped at 5 replicas per app.');
  });
});

describe('deployReplicaLines', () => {
  it('reports the status read after the deploy', () => {
    const text = strip(deployReplicaLines({ requested: 3, status: status({}) }));

    expect(text).toContain('3 requested, 3 effective');
  });

  it('says the status could not be read instead of hiding the request', () => {
    const text = strip(deployReplicaLines({ requested: 3 }));

    expect(text).toContain('3 requested, but the current status could not be read');
  });
});
