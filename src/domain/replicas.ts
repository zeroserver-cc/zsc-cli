/**
 * A replica count the CLI is willing to send: a whole number of at least 1.
 * The upper bound is the backend's call (platform cap), so a request above it is
 * accepted there and reported back as a warning instead of being rejected here.
 */
export function isValidReplicaCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}
