import { Command } from 'commander';
import { selfUpdate } from '../../infrastructure/self-update/updater';
import { isPackagedBinary } from '../../application/selfUpdate/autoUpdate';
import { VERSION } from '../../version';

export function registerUpgradeCommand(program: Command): void {
  program
    .command('upgrade')
    .description('Update zs to the latest published version')
    .action(async () => {
      if (!isPackagedBinary()) {
        console.error('`zs upgrade` only applies to the installed binary (reinstall via install.sh in dev).');
        process.exitCode = 1;
        return;
      }

      const result = await selfUpdate(VERSION, process.execPath);
      switch (result.reason) {
        case 'updated':
          console.log(`Updated zs ${result.fromVersion} → ${result.toVersion}.`);
          break;
        case 'up-to-date':
          console.log(`zs is already up to date (${result.fromVersion}).`);
          break;
        case 'permission':
          console.error(`Can't write ${process.execPath}. Try: sudo zs upgrade`);
          process.exitCode = 1;
          break;
        case 'unsupported-arch':
          console.error('No prebuilt zs binary for this OS/architecture.');
          process.exitCode = 1;
          break;
        case 'rate-limited':
          console.error('Hit the GitHub API rate limit. Try again in a bit.');
          process.exitCode = 1;
          break;
        default:
          console.error('Update failed. Try again later or reinstall via install.sh.');
          process.exitCode = 1;
      }
    });
}
