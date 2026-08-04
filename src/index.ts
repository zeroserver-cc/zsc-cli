import { Command } from 'commander';
import { registerAuthCommands } from './presentation/commands/auth';
import { registerAccountCommands } from './presentation/commands/account';
import { registerConfigCommands } from './presentation/commands/config';
import { registerDeployCommand } from './presentation/commands/deploy';
import { registerListCommand } from './presentation/commands/list';
import { registerDeploymentsCommand } from './presentation/commands/deployments';
import { registerLogsCommand } from './presentation/commands/logs';
import { registerStopCommand } from './presentation/commands/stop';
import { registerRestartCommand } from './presentation/commands/restart';
import { registerRemoveCommand } from './presentation/commands/remove';
import { registerNodeCommands } from './presentation/commands/nodes';
import { registerRegistryCommands } from './presentation/commands/registry';
import { registerDomainCommands } from './presentation/commands/domain';
import { registerVolumeCommand } from './presentation/commands/volume';
import { registerDatabaseCommands } from './presentation/commands/database';
import { registerUpgradeCommand } from './presentation/commands/upgrade';
import { VERSION } from './version';

export const program = new Command();

program
  .name('zs')
  .description('ZeroServer Community Cloud CLI')
  .version(VERSION);

registerAuthCommands(program);
registerAccountCommands(program);
registerConfigCommands(program);
registerDeployCommand(program);
registerListCommand(program);
registerDeploymentsCommand(program);
registerLogsCommand(program);
registerStopCommand(program);
registerRestartCommand(program);
registerRemoveCommand(program);
registerNodeCommands(program);
registerRegistryCommands(program);
registerDomainCommands(program);
registerVolumeCommand(program);
registerDatabaseCommands(program);
registerUpgradeCommand(program);
// This module only builds and exports the command tree. Parsing is driven by the
// entry points — `src/cli.ts` for the standalone binary and `bin/zs.js` for the
// npm install. Do NOT parse here: when esbuild bundles cli.ts (which imports this
// file) and pkg packages it, `require.main === module` also evaluates true for the
// inlined module, so a guarded parse here ran a SECOND time — every command executed
// twice (e.g. `zs deploy --port` fired once with the port and once without it,
// leaving the exposed container with no host port and breaking ingress).
