import {
  credentialsBlock,
  egressSummary,
  monitoringNotice,
  quotaNotice,
  replicationSummary,
  storedSummary
} from '../storage';
import { ManagedStorage } from '../../../domain/entities/types';

const base = {
  quotaGb: 10,
  egressQuotaGb: 50,
  quotaExceeded: false,
  quotaExceededReason: null,
  usage: {
    storedGb: 2.5,
    storedPercent: 25,
    egressGb: null,
    egressPercent: null,
    monitored: true,
    writesBlockEnforced: true
  },
  endpoint: 'https://media.s3.zeroserver.cc',
  region: 'zsc-br'
} as unknown as ManagedStorage;

describe('storage formatting', () => {
  it('shows unknown, never zero, for figures the node has not reported', () => {
    expect(storedSummary(base)).toBe('2.50 GB of 10 GB (25.0%)');
    expect(egressSummary(base)).toBe('unknown of 50 GB this month');
  });

  it('explains the standby copy in plain words', () => {
    expect(replicationSummary({ state: 'PROTECTED', rpoSeconds: 300 })).toMatch(/up to 5 min/);
    expect(replicationSummary({ state: 'DEGRADED', rpoSeconds: 300 })).toMatch(/missing, stale/);
    expect(replicationSummary({ state: 'SEEDING', rpoSeconds: 300 })).toMatch(/no protection yet/);
  });

  it('warns when writes are blocked, by reason', () => {
    expect(quotaNotice(base)).toBeNull();
    expect(quotaNotice({ ...base, quotaExceeded: true, quotaExceededReason: 'EGRESS' })).toMatch(
      /egress/
    );
    expect(quotaNotice({ ...base, quotaExceeded: true, quotaExceededReason: 'STORAGE' })).toMatch(
      /version id/
    );
  });

  it('warns when quotas are not enforced', () => {
    expect(monitoringNotice({ monitored: false, writesBlockEnforced: true })).toMatch(
      /not enforced/
    );
    expect(monitoringNotice({ monitored: true, writesBlockEnforced: false })).toMatch(/pending/);
    expect(monitoringNotice({ monitored: true, writesBlockEnforced: true })).toBeNull();
  });

  it('prints the secret only through the credentials block', () => {
    const lines = credentialsBlock(base, {
      id: 'k',
      accessKeyId: 'AK',
      secretAccessKey: 'SECRET',
      label: '',
      createdAt: ''
    });
    expect(lines.join('\n')).toContain('SECRET');
    expect(JSON.stringify(quotaNotice(base))).not.toContain('SECRET');
  });
});
