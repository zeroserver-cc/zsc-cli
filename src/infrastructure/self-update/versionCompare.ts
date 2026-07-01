/** Strips a leading `v` and any pre-release/build suffix, returning [major, minor, patch]. */
function parse(version: string): [number, number, number] {
  const core = version.trim().replace(/^v/i, '').split(/[-+]/)[0];
  const parts = core.split('.').map((n) => parseInt(n, 10));
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

/**
 * True when `candidate` is a strictly higher version than `current`. Tolerates a
 * `v` prefix (release tags are `vX.Y.Z`, package versions aren't).
 */
export function isNewerVersion(candidate: string, current: string): boolean {
  const a = parse(candidate);
  const b = parse(current);
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return false;
}
