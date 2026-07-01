#!/usr/bin/env node
// Entry point for the standalone `zs` binary (ZSC-115/116). The compiled binary is
// installed as `zs` in the PATH (see install.sh), so this file just wires the
// command tree and drives the parse explicitly — no Node runtime required by the
// end user once packaged.
import { program } from './index';
import { maybeAutoUpdate } from './application/selfUpdate/autoUpdate';

// A daily, interactive-only auto-update check runs before the command. It's
// throttled and skipped for scripts/pipes, so it never adds latency to scripted
// use; failures are swallowed so they can't block the command. `upgrade`,
// `--version` and `--help` skip it (upgrade does its own update; the others must
// stay instant and offline).
const argv = process.argv.slice(2);
const skipAutoUpdate =
  argv.length === 0 ||
  argv[0] === 'upgrade' ||
  argv.includes('-V') ||
  argv.includes('--version') ||
  argv.includes('-h') ||
  argv.includes('--help');

(async () => {
  if (!skipAutoUpdate) {
    await maybeAutoUpdate();
  }
  program.parse(process.argv);
})();

