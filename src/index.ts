import { Command } from 'commander';
import { registerAuthCommands } from './presentation/commands/auth';
import { registerConfigCommands } from './presentation/commands/config';
import { registerDeployCommand } from './presentation/commands/deploy';
import { registerListCommand } from './presentation/commands/list';
import { registerLogsCommand } from './presentation/commands/logs';
import { registerStopCommand } from './presentation/commands/stop';

export const program = new Command();

program
  .name('zs')
  .description('ZeroServer Community Cloud CLI')
  .version('0.1.0');

registerAuthCommands(program);
registerConfigCommands(program);
registerDeployCommand(program);
registerListCommand(program);
registerLogsCommand(program);
registerStopCommand(program);

// Only parse args when run directly (not in tests)
if (require.main === module) {
  program.parse(process.argv);
}
