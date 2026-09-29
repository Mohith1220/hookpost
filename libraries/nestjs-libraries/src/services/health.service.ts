import { Injectable } from '@nestjs/common';
import { TemporalService } from 'nestjs-temporal-core';
import { PrismaRepository } from '@hookpost/nestjs-libraries/database/prisma/prisma.service';

/**
 * What the external uptime monitor (.github/workflows/uptime.yml) reads.
 *
 * - db: one indexed read through Prisma. If this fails the API cannot serve
 *   anything useful, so the endpoint answers 503.
 * - worker: whether an orchestrator worker has polled the "main" Temporal task
 *   queue recently. Temporal remembers each poller's last poll for a few
 *   minutes, so an empty list means no worker is picking up posts or emails.
 *   Reported in the body only: the API itself is still up when the worker is
 *   down, and the monitor treats the two as separate checks.
 *
 * Results are cached for a few seconds so the endpoint is cheap to hammer.
 */
export interface HealthReport {
  status: 'ok' | 'degraded' | 'down';
  db: 'ok' | 'error';
  worker: 'ok' | 'no_pollers' | 'error';
  workerLastPollSecondsAgo: number | null;
  checkedAt: string;
}

const CACHE_MS = 10_000;
const STEP_TIMEOUT_MS = 4_000;
// A healthy worker long-polls at least once a minute.
const WORKER_STALE_SECONDS = 180;
// temporal.api.enums.v1.TaskQueueType.TASK_QUEUE_TYPE_WORKFLOW
const TASK_QUEUE_TYPE_WORKFLOW = 1;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

@Injectable()
export class HealthService {
  private _cached?: { at: number; report: HealthReport };

  constructor(
    private _user: PrismaRepository<'user'>,
    private _temporalService: TemporalService
  ) {}

  async check(): Promise<HealthReport> {
    if (this._cached && Date.now() - this._cached.at < CACHE_MS) {
      return this._cached.report;
    }

    const [db, worker] = await Promise.all([this.checkDb(), this.checkWorker()]);
    const report: HealthReport = {
      status: db !== 'ok' ? 'down' : worker.state !== 'ok' ? 'degraded' : 'ok',
      db,
      worker: worker.state,
      workerLastPollSecondsAgo: worker.secondsAgo,
      checkedAt: new Date().toISOString(),
    };
    this._cached = { at: Date.now(), report };
    return report;
  }

  private async checkDb(): Promise<HealthReport['db']> {
    try {
      await withTimeout(
        this._user.model.user.findFirst({ select: { id: true } }),
        STEP_TIMEOUT_MS
      );
      return 'ok';
    } catch {
      return 'error';
    }
  }

  private async checkWorker(): Promise<{
    state: HealthReport['worker'];
    secondsAgo: number | null;
  }> {
    try {
      const client = this._temporalService.client?.getRawClient();
      if (!client) return { state: 'error', secondsAgo: null };

      const res = await withTimeout(
        client.workflowService.describeTaskQueue({
          namespace: process.env.TEMPORAL_NAMESPACE || 'default',
          taskQueue: { name: 'main' },
          taskQueueType: TASK_QUEUE_TYPE_WORKFLOW,
        }),
        STEP_TIMEOUT_MS
      );

      const lastPoll = (res.pollers || [])
        .map((p) => {
          const t = p.lastAccessTime;
          if (!t?.seconds) return 0;
          return Number(t.seconds) * 1000 + Math.floor((t.nanos || 0) / 1e6);
        })
        .reduce((a, b) => Math.max(a, b), 0);

      if (!lastPoll) return { state: 'no_pollers', secondsAgo: null };
      const secondsAgo = Math.max(0, Math.round((Date.now() - lastPoll) / 1000));
      return {
        state: secondsAgo <= WORKER_STALE_SECONDS ? 'ok' : 'no_pollers',
        secondsAgo,
      };
    } catch {
      return { state: 'error', secondsAgo: null };
    }
  }
}
