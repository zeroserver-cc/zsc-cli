import { Command, InvalidArgumentError } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import { randomBytes } from 'crypto';
import {
  addInferenceServiceTokenUseCase,
  createInferenceServiceUseCase,
  deleteInferenceServiceUseCase,
  listAiModelsUseCase,
  listHfModelFilesUseCase,
  listInferenceServicesUseCase,
  resolveInferenceServiceUseCase,
  revokeInferenceServiceTokenUseCase,
  searchHfModelsUseCase
} from '../../application/usecases/ManagedInferenceUseCase';
import { requireRole } from '../../application/usecases/requireRole';
import {
  HfModelFile,
  HfModelSummary,
  ManagedInferenceService,
  ManagedInferenceServiceStatus
} from '../../domain/entities/types';
import { GraphQLError } from '../../infrastructure/graphql/client';
import { handleError } from '../formatting/errors';
import { prompt } from '../io/prompt';

function statusLabel(status: ManagedInferenceServiceStatus): string {
  switch (status) {
    case 'RUNNING':
      return chalk.green(status);
    case 'ERROR':
      return chalk.red(status);
    case 'DELETING':
    case 'DELETED':
      return chalk.gray(status);
    default:
      return chalk.yellow(status);
  }
}

function formatSizeGb(sizeBytes: number): string {
  return (sizeBytes / 1e9).toFixed(1);
}

function formatCount(value: number): string {
  return value.toLocaleString('en-US');
}

/**
 * Strip control chars (including ANSI escapes and newlines) from remote data
 * before printing it in a table cell, so a malicious or broken payload cannot
 * inject terminal sequences or break the table layout.
 */
function sanitizeCell(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001f\u007f-\u009f]/g, '');
}

// Hugging Face repo id (owner/repo) and model spec (owner/repo[:file.gguf]).
// The backend is the validation authority (gated, split, oversize); these only
// catch typos early.
const HF_REPO_ID = /^[\w.-]+\/[\w.-]+$/;
const HF_MODEL_SPEC = /^[\w.-]+\/[\w.-]+(:[\w.-]+\.gguf)?$/i;

function parseRepoId(value: string): string {
  if (!HF_REPO_ID.test(value)) {
    throw new InvalidArgumentError(
      'must be a Hugging Face repo id (owner/repo), e.g. bartowski/Qwen2.5-7B-Instruct-GGUF'
    );
  }
  return value;
}

function parseModelSpec(value: string): string {
  if (value.includes('/') && !HF_MODEL_SPEC.test(value)) {
    throw new InvalidArgumentError(
      'invalid Hugging Face model spec; use owner/repo[:file.gguf], ' +
        'e.g. bartowski/Qwen2.5-7B-Instruct-GGUF:Qwen2.5-7B-Instruct-Q4_K_M.gguf'
    );
  }
  return value;
}

function formatVram(minVramMb: number): string {
  return minVramMb >= 1024 ? `${Math.round(minVramMb / 1024)} GB` : `${minVramMb} MB`;
}

function formatContext(contextTokens: number): string {
  return contextTokens >= 1024 ? `${Math.round(contextTokens / 1024)}k` : String(contextTokens);
}

function nodeLabel(service: ManagedInferenceService): string {
  return service.machine?.name ?? service.machineId ?? '-';
}

function modelLabel(service: ManagedInferenceService): string {
  return service.model?.name ?? service.modelId;
}

// DNS-safe because the name becomes part of the public hostname (backend rule).
const DNS_SAFE_NAME = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

function parseServiceName(value: string): string {
  if (!DNS_SAFE_NAME.test(value)) {
    throw new InvalidArgumentError(
      'must be DNS-safe: lowercase letters, digits and dashes, starting and ending with a letter or digit'
    );
  }
  return value;
}

/** The name becomes part of the public hostname, so it must be DNS-safe. */
function defaultServiceName(modelId: string): string {
  const base = modelId
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `${base || 'llm'}-${randomBytes(3).toString('hex')}`;
}

function isAllowlistError(err: unknown): boolean {
  return err instanceof GraphQLError && /allowlist|closed beta/i.test(err.message);
}

/**
 * Without a TTY the readline confirmation promise never resolves on an empty
 * stdin, and the process can exit 0 having done nothing. Fail fast instead.
 */
function assertInteractiveConfirmation(yes?: boolean): void {
  if (yes) return;
  if (!process.stdin.isTTY) {
    console.error(
      chalk.red('Error:'),
      'This command asks for a confirmation, but stdin is not interactive. Pass -y (--yes) to run non-interactively.'
    );
    process.exit(1);
  }
}

function printTokenOnceWarning(): void {
  console.log(
    chalk.yellow(
      'This token is shown only once. Store it now: it cannot be retrieved later, only its hint.'
    )
  );
}

function printRestartNotice(): void {
  console.log(chalk.gray('The service restarts briefly to apply the token change.'));
}

function printTokensTable(service: ManagedInferenceService): void {
  if (service.tokens.length === 0) {
    console.log(chalk.gray('No tokens.'));
    return;
  }
  const table = new Table({ head: ['ID', 'Label', 'Hint', 'Created'] });
  for (const token of service.tokens) {
    table.push([
      sanitizeCell(token.id),
      sanitizeCell(token.label),
      sanitizeCell(token.hint),
      new Date(token.createdAt).toLocaleString()
    ]);
  }
  console.log(table.toString());
}

function printServicesTable(services: ManagedInferenceService[]): void {
  if (services.length === 0) {
    console.log(
      chalk.yellow('No inference services. Create one with "zs ai create --model <id>".')
    );
    return;
  }
  const table = new Table({ head: ['Name', 'Model', 'Status', 'Endpoint', 'Node'] });
  for (const service of services) {
    table.push([
      sanitizeCell(service.name),
      sanitizeCell(modelLabel(service)),
      statusLabel(service.status),
      sanitizeCell(service.endpoint ?? '-'),
      sanitizeCell(nodeLabel(service))
    ]);
  }
  console.log(table.toString());
}

function printHfSearchTable(models: HfModelSummary[], search: string): void {
  if (models.length === 0) {
    console.log(
      chalk.yellow(`No Hugging Face GGUF repos found for "${search}". Try a broader term.`)
    );
    return;
  }
  const table = new Table({ head: ['Repo', 'Downloads', 'Likes', 'License'] });
  for (const model of models) {
    table.push([
      sanitizeCell(model.repoId),
      formatCount(model.downloads),
      formatCount(model.likes),
      sanitizeCell(model.license ?? '-')
    ]);
  }
  console.log(table.toString());
  console.log(
    chalk.gray(
      'Pick a file with "zs ai files <owner/repo>", then create with "zs ai create --model <owner/repo>:<file.gguf>".'
    )
  );
}

function printHfFilesTable(repoId: string, files: HfModelFile[]): void {
  if (files.length === 0) {
    console.log(chalk.yellow(`No root-level GGUF files found in "${repoId}".`));
    return;
  }
  const table = new Table({ head: ['File', 'Size (GB)', 'Recommended'] });
  for (const file of files) {
    table.push([
      sanitizeCell(file.file),
      formatSizeGb(file.sizeBytes),
      file.recommended ? '*' : ''
    ]);
  }
  console.log(table.toString());
  console.log(
    chalk.gray(
      `* = recommended quant. Create with "zs ai create --model ${repoId}:<file.gguf>" ` +
        `(omit :<file> to use the recommended one).`
    )
  );
}

export function registerAiCommands(program: Command): void {
  const ai = program
    .command('ai')
    .description('Manage platform-managed LLM inference services (AIaaS, closed beta)');

  ai.command('models')
    .alias('catalog')
    .description('List the public catalog of servable AI models')
    .option('--search <term>', 'Search Hugging Face GGUF repos instead of listing the catalog')
    .action(async (opts: { search?: string }) => {
      requireRole(['developer', 'admin']);
      if (opts.search !== undefined) {
        const term = opts.search.trim();
        if (term.length < 2) {
          throw new InvalidArgumentError('--search requires at least 2 characters.');
        }
        const spinner = ora(`Searching Hugging Face for "${term}"…`).start();
        try {
          const models = await searchHfModelsUseCase(term);
          spinner.stop();
          printHfSearchTable(models, term);
        } catch (err) {
          spinner.fail('Failed to search Hugging Face models.');
          handleError(err);
        }
        return;
      }
      const spinner = ora('Fetching model catalog…').start();
      try {
        const models = await listAiModelsUseCase();
        spinner.stop();
        if (models.length === 0) {
          console.log(chalk.yellow('No models in the catalog right now.'));
          return;
        }
        const table = new Table({
          head: ['ID', 'Name', 'Size (GB)', 'Min VRAM', 'Context', 'Backends', 'License']
        });
        for (const model of models) {
          table.push([
            sanitizeCell(model.id),
            sanitizeCell(model.name),
            formatSizeGb(model.sizeBytes),
            formatVram(model.minVramMb),
            formatContext(model.contextTokens),
            model.supportedBackends.map(sanitizeCell).join('/'),
            sanitizeCell(model.license)
          ]);
        }
        console.log(table.toString());
        console.log(
          chalk.gray('Create a service with "zs ai create --model <id> [--name <name>]".')
        );
      } catch (err) {
        spinner.fail('Failed to fetch the model catalog.');
        handleError(err);
      }
    });

  ai.command('files')
    .argument('<repo>', 'Hugging Face repo id (owner/repo)', parseRepoId)
    .description('List the GGUF files of a Hugging Face repo, with the recommended pick flagged')
    .action(async (repoId: string) => {
      requireRole(['developer', 'admin']);
      const spinner = ora(`Fetching GGUF files of ${chalk.cyan(repoId)}…`).start();
      try {
        const files = await listHfModelFilesUseCase(repoId);
        spinner.stop();
        printHfFilesTable(repoId, files);
      } catch (err) {
        spinner.fail('Failed to fetch the repo files.');
        handleError(err);
      }
    });

  ai.command('list')
    .alias('ls')
    .description('List your inference services')
    .action(async () => {
      requireRole(['developer', 'admin']);
      const spinner = ora('Fetching inference services…').start();
      try {
        const services = await listInferenceServicesUseCase();
        spinner.stop();
        printServicesTable(services);
      } catch (err) {
        spinner.fail('Failed to fetch inference services.');
        handleError(err);
      }
    });

  ai.command('create')
    .description(
      'Create a managed inference service from a catalog model or a Hugging Face GGUF spec'
    )
    .requiredOption(
      '--model <id|spec>',
      'Catalog model id (see "zs ai models") or Hugging Face spec owner/repo[:file.gguf], ' +
        'e.g. bartowski/Qwen2.5-7B-Instruct-GGUF:Qwen2.5-7B-Instruct-Q4_K_M.gguf ' +
        '(omit :file to use the recommended quant)',
      parseModelSpec
    )
    .option(
      '--name <name>',
      'Service name (DNS-safe; part of the public hostname)',
      parseServiceName
    )
    .action(async (opts: { model: string; name?: string }) => {
      requireRole(['developer', 'admin']);
      const name = opts.name ?? defaultServiceName(opts.model);
      const spinner = ora(
        `Creating inference service ${chalk.cyan(name)} (model ${opts.model})…`
      ).start();
      try {
        const { service, initialToken } = await createInferenceServiceUseCase(name, opts.model);
        spinner.succeed(
          `Inference service ${chalk.bold(service.name)} created (status ${statusLabel(service.status)}).`
        );
        console.log(`ID:       ${chalk.bold(service.id)}`);
        console.log(
          `Endpoint: ${service.endpoint ?? chalk.gray('pending; shown by "zs ai status" once RUNNING')}`
        );
        console.log(`API token: ${initialToken}`);
        printTokenOnceWarning();
        console.log(
          chalk.gray(
            `The endpoint is OpenAI-compatible. Manage tokens with "zs ai token add/list/revoke ${service.name}".`
          )
        );
      } catch (err) {
        spinner.fail('Failed to create the inference service.');
        if (isAllowlistError(err)) {
          handleError(
            new Error(
              'Managed inference is in closed beta and this account is not on the allowlist yet. ' +
                'Request beta access in the community Discord or at zeroserver.cc.'
            )
          );
        } else {
          handleError(err);
        }
      }
    });

  ai.command('status [name]')
    .description('Detail an inference service (including its tokens); without a name, lists yours')
    .action(async (target?: string) => {
      requireRole(['developer', 'admin']);
      const spinner = ora('Fetching inference services…').start();
      try {
        if (!target) {
          const services = await listInferenceServicesUseCase();
          spinner.stop();
          printServicesTable(services);
          return;
        }
        const service = await resolveInferenceServiceUseCase(target);
        spinner.stop();
        console.log(`Name:     ${chalk.bold(service.name)}`);
        console.log(`ID:       ${service.id}`);
        console.log(`Model:    ${modelLabel(service)}`);
        console.log(`Status:   ${statusLabel(service.status)}`);
        console.log(`Endpoint: ${service.endpoint ?? '-'}`);
        console.log(`Node:     ${nodeLabel(service)}`);
        console.log(`Created:  ${new Date(service.createdAt).toLocaleString()}`);
        if (service.errorMessage) {
          console.log(`Error:    ${chalk.red(service.errorMessage)}`);
        }
        console.log('Tokens (metadata only; values are never shown):');
        printTokensTable(service);
      } catch (err) {
        spinner.fail('Failed to fetch inference services.');
        handleError(err);
      }
    });

  const token = ai.command('token').description('Manage API tokens of an inference service');

  token
    .command('add <name>')
    .description('Add an API token to a service; the value is shown once')
    .requiredOption('--label <label>', 'Label identifying the token (e.g. the app using it)')
    .action(async (target: string, opts: { label: string }) => {
      requireRole(['developer', 'admin']);
      const spinner = ora(`Adding token to ${chalk.cyan(target)}…`).start();
      try {
        const { service, token: created } = await addInferenceServiceTokenUseCase(
          target,
          opts.label
        );
        spinner.succeed(`Token ${chalk.bold(created.label)} added to ${chalk.bold(service.name)}.`);
        console.log(`Token: ${created.token}`);
        printTokenOnceWarning();
        printRestartNotice();
      } catch (err) {
        spinner.fail('Failed to add the token.');
        handleError(err);
      }
    });

  token
    .command('list')
    .alias('ls')
    .description('List the tokens of a service (label and hint; never the value)')
    .argument('<name>', 'Service name or id')
    .action(async (target: string) => {
      requireRole(['developer', 'admin']);
      const spinner = ora(`Fetching tokens of ${chalk.cyan(target)}…`).start();
      try {
        const service = await resolveInferenceServiceUseCase(target);
        spinner.stop();
        printTokensTable(service);
      } catch (err) {
        spinner.fail('Failed to fetch tokens.');
        handleError(err);
      }
    });

  token
    .command('revoke <name> <tokenId>')
    .description('Revoke an API token of a service (accepts an id prefix)')
    .option('-y, --yes', 'Skip the confirmation prompt')
    .action(async (target: string, tokenId: string, opts: { yes?: boolean }) => {
      requireRole(['developer', 'admin']);
      let spinner: ReturnType<typeof ora> | undefined;
      try {
        assertInteractiveConfirmation(opts.yes);
        if (!opts.yes) {
          const answer = await prompt(
            `Revoke token ${tokenId} of service ${target}? Clients using it lose access immediately. [y/N] `
          );
          if (answer.trim().toLowerCase() !== 'y') {
            console.log('Aborted.');
            return;
          }
        }
        spinner = ora(`Revoking token ${chalk.cyan(tokenId)}…`).start();
        const {
          service,
          token: revokedToken,
          revoked
        } = await revokeInferenceServiceTokenUseCase(target, tokenId);
        if (revoked) {
          spinner.succeed(
            `Token ${chalk.bold(revokedToken.label)} (${revokedToken.hint}) revoked from ${chalk.bold(service.name)}.`
          );
          printRestartNotice();
        } else {
          spinner.warn(`Token ${revokedToken.label} was not revoked.`);
        }
      } catch (err) {
        // handleError exits the process; stop the spinner first or it keeps
        // animating over the error output.
        spinner?.stop();
        handleError(err);
      }
    });

  ai.command('delete <name>')
    .alias('rm')
    .description('Delete an inference service: the container is torn down and tokens are revoked')
    .option('-y, --yes', 'Skip the confirmation prompt')
    .action(async (target: string, opts: { yes?: boolean }) => {
      requireRole(['developer', 'admin']);
      let spinner: ReturnType<typeof ora> | undefined;
      try {
        assertInteractiveConfirmation(opts.yes);
        if (!opts.yes) {
          const answer = await prompt(
            `Delete inference service ${target}? The container is torn down and all its tokens stop working. [y/N] `
          );
          if (answer.trim().toLowerCase() !== 'y') {
            console.log('Aborted.');
            return;
          }
        }
        spinner = ora(`Deleting inference service ${chalk.cyan(target)}…`).start();
        const { service, deleted } = await deleteInferenceServiceUseCase(target);
        if (deleted) {
          spinner.succeed(`Inference service ${chalk.bold(service.name)} deleted.`);
        } else {
          spinner.warn(`Inference service ${service.name} was not deleted.`);
        }
      } catch (err) {
        spinner?.stop();
        handleError(err);
      }
    });
}
