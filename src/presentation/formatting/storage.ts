import axios from 'axios';
import {
  ManagedStorage,
  ManagedStorageCreatedAccessKey,
  ManagedStorageReplication,
  ManagedStorageUsage
} from '../../domain/entities/types';

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  return `${Math.round(seconds / 3600)} h`;
}

function formatGb(value?: number | null): string {
  return value === null || value === undefined ? 'unknown' : `${value.toFixed(2)} GB`;
}

function formatPercent(value?: number | null): string {
  return value === null || value === undefined ? '' : ` (${value.toFixed(1)}%)`;
}

export function storedSummary(storage: ManagedStorage): string {
  const { usage } = storage;
  return `${formatGb(usage.storedGb)} of ${storage.quotaGb} GB${formatPercent(usage.storedPercent)}`;
}

export function egressSummary(storage: ManagedStorage): string {
  const { usage } = storage;
  return `${formatGb(usage.egressGb)} of ${storage.egressQuotaGb} GB this month${formatPercent(usage.egressPercent)}`;
}

/** Plain-language state of the standby copy, with the data-loss window it implies. */
export function replicationSummary(replication: ManagedStorageReplication): string {
  const window = formatDuration(replication.rpoSeconds);
  switch (replication.state) {
    case 'PROTECTED':
      return `protected by a standby copy; if the node is lost, up to ${window} of recent writes may be lost`;
    case 'SEEDING':
      return 'standby copy is being created; no protection yet';
    case 'DEGRADED':
      return 'standby copy is missing, stale or failing; a node loss now may lose more than the usual window';
    case 'FAILING_OVER':
      return 'host lost, moving to the standby copy; the endpoint is unavailable until it is up';
    case 'DISABLED':
      return 'no standby copy for this instance';
  }
}

export function quotaNotice(storage: ManagedStorage): string | null {
  if (!storage.quotaExceeded) return null;
  const which = storage.quotaExceededReason === 'EGRESS' ? 'monthly egress' : 'storage';
  const unblock =
    storage.quotaExceededReason === 'EGRESS'
      ? 'The cycle starts over on the 1st (UTC).'
      : 'Delete objects (by version id in versioned buckets) to free space.';
  return `Writes are blocked: the ${which} quota was reached. Reads, listings and deletes still work. ${unblock}`;
}

export function monitoringNotice(usage: ManagedStorageUsage): string | null {
  if (!usage.monitored) {
    return 'Usage is not being reported by the hosting node, so quotas are not enforced and figures may be missing.';
  }
  if (!usage.writesBlockEnforced) {
    return 'A write block change is pending on the node; it applies within about a minute.';
  }
  return null;
}

export function credentialsBlock(
  storage: ManagedStorage,
  key: ManagedStorageCreatedAccessKey
): string[] {
  return [
    `Endpoint:          ${storage.endpoint}`,
    `Region:            ${storage.region}`,
    `Access key ID:     ${key.accessKeyId}`,
    `Secret access key: ${key.secretAccessKey}`
  ];
}

// The secret is printed once, in credentialsBlock; here it is a placeholder.
export function envExample(storage: ManagedStorage, key: ManagedStorageCreatedAccessKey): string[] {
  return [
    `export AWS_ACCESS_KEY_ID=${key.accessKeyId}`,
    'export AWS_SECRET_ACCESS_KEY=<the secret access key above>',
    `export AWS_ENDPOINT_URL=${storage.endpoint}`,
    `export AWS_DEFAULT_REGION=${storage.region}`
  ];
}

const MAYBE_CREATED_CODES = ['ECONNABORTED', 'ETIMEDOUT', 'ECONNRESET', 'ERR_NETWORK'];

/** The request may have reached the backend even though the CLI got no answer. */
export function isOutcomeUnknownError(err: unknown): boolean {
  if (!axios.isAxiosError(err)) return false;
  if (!err.response) return true;
  return MAYBE_CREATED_CODES.includes(err.code ?? '') || err.response.status >= 500;
}
