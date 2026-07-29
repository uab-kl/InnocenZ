import cron, { ScheduledTask } from 'node-cron';
import { logger } from '@/util/logger.js';

/**
 * Kuala Lumpur. Every job here is a business rhythm — the weekly payout, an
 * end-of-shift sweep — so "midnight" has to mean midnight where the venues are,
 * not wherever the box happens to be provisioned.
 */
export const SCHEDULER_TIMEZONE = 'Asia/Kuala_Lumpur';

export interface JobDefinition {
  /** Stable identifier, used for logging and the overlap guard. */
  name: string;
  /** Standard 5-field cron expression, read in SCHEDULER_TIMEZONE. */
  schedule: string;
  run: () => Promise<void>;
}

/**
 * The one place background work is registered.
 *
 * Deliberately a tiny wrapper rather than scattered `cron.schedule` calls: the
 * two things that actually bite — a job silently overlapping itself, and a job
 * throwing into an unhandled rejection that takes the process down — have to be
 * solved once, not per job.
 */
class SchedulerClass {
  private jobs = new Map<string, { definition: JobDefinition; task?: ScheduledTask }>();
  /** Names currently mid-run, so a slow job cannot be started on top of itself. */
  private running = new Set<string>();
  private started = false;

  register(definition: JobDefinition): void {
    if (this.jobs.has(definition.name)) {
      // Two jobs under one name would make the overlap guard silently gate the
      // wrong one, so this is a programming error rather than a warning.
      throw new Error(`[scheduler] duplicate job name: ${definition.name}`);
    }
    if (!cron.validate(definition.schedule)) {
      throw new Error(
        `[scheduler] invalid cron expression for ${definition.name}: ${definition.schedule}`,
      );
    }
    this.jobs.set(definition.name, { definition });
    if (this.started) this.startJob(definition.name);
  }

  /**
   * Runs a job with the two guards applied. Exposed so a job can also be
   * triggered by hand (a script, an admin action) and still get them.
   */
  async runNow(name: string): Promise<void> {
    const entry = this.jobs.get(name);
    if (!entry) throw new Error(`[scheduler] unknown job: ${name}`);

    if (this.running.has(name)) {
      // The previous tick has not finished. Skipping is right for the jobs here
      // (a payout sweep, a reminder pass) — they are catch-up by nature, so the
      // next tick covers whatever this one would have.
      logger.warn(`[scheduler] ${name} still running, skipping this tick`);
      return;
    }

    this.running.add(name);
    const startedAt = Date.now();
    try {
      await entry.definition.run();
      logger.info(`[scheduler] ${name} finished in ${Date.now() - startedAt}ms`);
    } catch (error) {
      // Swallowed on purpose: an unhandled rejection inside a cron tick would
      // take the API process down with it. The job is broken, not the server.
      logger.error(`[scheduler] ${name} failed:`, error);
    } finally {
      this.running.delete(name);
    }
  }

  private startJob(name: string): void {
    const entry = this.jobs.get(name);
    if (!entry || entry.task) return;
    entry.task = cron.schedule(
      entry.definition.schedule,
      () => {
        void this.runNow(name);
      },
      { timezone: SCHEDULER_TIMEZONE },
    );
    logger.info(
      `[scheduler] ${name} scheduled (${entry.definition.schedule} ${SCHEDULER_TIMEZONE})`,
    );
  }

  /** Idempotent, so a repeated call during boot cannot double-schedule anything. */
  start(): void {
    if (this.started) return;
    this.started = true;
    for (const name of this.jobs.keys()) this.startJob(name);
    if (this.jobs.size === 0) logger.info('[scheduler] started with no jobs registered');
  }

  /** Used by tests and graceful shutdown. */
  stop(): void {
    for (const entry of this.jobs.values()) {
      entry.task?.stop();
      entry.task = undefined;
    }
    this.started = false;
  }

  list(): string[] {
    return [...this.jobs.keys()];
  }
}

export const scheduler = new SchedulerClass();
