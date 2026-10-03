import chalk from 'chalk';
import { ReplicaOutcome } from '../../application/usecases/ReplicasUseCase';
import { ReplicaStatus } from '../../domain/entities/types';

/**
 * Lines that describe the replicas of an app after a deploy or "zs scale":
 * requested/effective/running counts, the platform's warnings (why effective is
 * lower than requested) and, when more than one replica runs, what that means
 * for billing and for the app itself.
 */
export function replicaReportLines(status: ReplicaStatus): string[] {
  const { desiredReplicas, effectiveReplicas, runningReplicas, replicaWarnings } = status;
  const starting = runningReplicas < effectiveReplicas;
  const counts =
    `${desiredReplicas} requested, ${effectiveReplicas} effective, ${runningReplicas} running` +
    (starting ? ' (the others start in the background)' : '');

  const lines = [`Replicas:    ${chalk.bold(counts)}`];
  for (const warning of replicaWarnings) {
    lines.push(chalk.yellow(`Warning: ${warning}`));
  }
  if (effectiveReplicas > 1) {
    lines.push(
      chalk.gray(
        `Billing:     each replica is a separate instance, so ${effectiveReplicas} replicas cost ${effectiveReplicas} x the per-instance hourly price.`
      ),
      chalk.gray(
        'Stateless:   requests are balanced round-robin with no sticky sessions; keep sessions in a signed cookie or an external database.'
      )
    );
  }
  return lines;
}

/** Replica section of a deploy report; says so when the status could not be read. */
export function deployReplicaLines({ requested, status }: ReplicaOutcome): string[] {
  if (status) return replicaReportLines(status);
  return [
    chalk.yellow(
      `Replicas:    ${requested} requested, but the current status could not be read. Run "zs scale <app> ${requested}" to check it.`
    )
  ];
}
