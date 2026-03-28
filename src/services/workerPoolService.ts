import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { env } from '../config/env';
import { createChildLogger } from '../core/logger';
import type {
  BacktestRunResult,
  BotSettings,
  MarketRegime,
  MarketSnapshot,
  MicrostructureFeatures,
  PatternMatchResult,
  ProbabilityAssessment,
  SignalCandidate,
  WorkerHealth,
  BacktestRunConfig,
} from '../core/types';
import { PatternMatcher } from '../domain/history/patternMatcher';
import { FeaturePipeline } from '../domain/intelligence/featurePipeline';
import {
  simulateBacktestReplay,
  type SimulateBacktestInput,
} from '../domain/backtest/backtestEngine';

type WorkerTaskType = 'feature' | 'pattern' | 'backtest';

export interface WorkerRuntimeMetadata {
  type: WorkerTaskType;
  workerPath: string;
  useTsxCli: boolean;
}

export interface FeatureTaskInput {
  snapshot: MarketSnapshot;
  signal: SignalCandidate;
  recentSnapshots: MarketSnapshot[];
}

export interface PatternTaskInput {
  pair: string;
  signal: SignalCandidate;
  microstructure: MicrostructureFeatures;
  probability: ProbabilityAssessment;
  regime: MarketRegime;
}

export interface BacktestTaskInput extends SimulateBacktestInput {
  config: BacktestRunConfig;
  settings: BotSettings;
}

interface WorkerTaskPayloadMap {
  feature: FeatureTaskInput;
  pattern: PatternTaskInput;
  backtest: BacktestTaskInput;
}

interface WorkerTaskResultMap {
  feature: MicrostructureFeatures;
  pattern: PatternMatchResult[];
  backtest: BacktestRunResult;
}

interface WorkerMessage<TResult> {
  id: string;
  result?: TResult;
  error?: string;
}

interface QueuedJob<T extends WorkerTaskType> {
  id: string;
  type: T;
  payload: WorkerTaskPayloadMap[T];
  timeout: NodeJS.Timeout | null;
  resolve: (value: WorkerTaskResultMap[T]) => void;
  reject: (error: Error) => void;
}

interface AnyQueuedJob {
  id: string;
  type: WorkerTaskType;
  payload: WorkerTaskPayloadMap[WorkerTaskType];
  timeout: NodeJS.Timeout | null;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

interface WorkerWrapper {
  workerId: string;
  type: WorkerTaskType;
  worker: Worker;
  busy: boolean;
  currentJobId: string | null;
  jobsProcessed: number;
  lastJobAt: string | null;
  lastError: string | null;
}

const log = createChildLogger({ module: 'worker-pool' });

export class WorkerPoolService {
  private readonly queue: AnyQueuedJob[] = [];
  private readonly jobs = new Map<string, AnyQueuedJob>();
  private readonly workers: WorkerWrapper[] = [];
  private readonly expectedExitWorkerIds = new Set<string>();
  private readonly featurePipeline = new FeaturePipeline();
  private readonly patternMatcher = new PatternMatcher();
  private started = false;
  private enabled = env.workerEnabled;
  private poolSize = env.workerPoolSize;

  constructor() {}

  async start(options?: { enabled?: boolean; poolSize?: number }): Promise<void> {
    const nextEnabled = options?.enabled ?? this.enabled;
    const nextPoolSize = options?.poolSize ?? this.poolSize;
    const effectiveEnabled = nextEnabled && nextPoolSize > 0;

    if (this.started) {
      const effectiveCurrentlyEnabled = this.enabled && this.poolSize > 0;
      const unchanged =
        effectiveEnabled === effectiveCurrentlyEnabled &&
        nextEnabled === this.enabled &&
        nextPoolSize === this.poolSize;
      if (unchanged) {
        return;
      }
      await this.stop();
    }

    this.enabled = nextEnabled;
    this.poolSize = nextPoolSize;

    if (!effectiveEnabled) {
      return;
    }

    this.started = true;
    const workerPlan: Record<WorkerTaskType, number> = {
      feature: Math.max(1, this.poolSize),
      pattern: 1,
      backtest: 1,
    };

    (Object.keys(workerPlan) as WorkerTaskType[]).forEach((type) => {
      for (let index = 0; index < workerPlan[type]; index += 1) {
        this.workers.push(this.createWorker(type));
      }
    });
  }

  async stop(): Promise<void> {
    this.started = false;
    const activeWorkers = [...this.workers];
    this.workers.length = 0;

    for (const job of this.jobs.values()) {
      if (job.timeout) {
        clearTimeout(job.timeout);
      }
      job.reject(new Error('Worker pool stopped'));
    }

    this.jobs.clear();
    this.queue.length = 0;
    activeWorkers.forEach((worker) => this.expectedExitWorkerIds.add(worker.workerId));
    await Promise.allSettled(activeWorkers.map((worker) => worker.worker.terminate()));
  }

  snapshot(): WorkerHealth[] {
    return this.workers.map((worker) => ({
      workerId: worker.workerId,
      name: worker.type,
      busy: worker.busy,
      jobsProcessed: worker.jobsProcessed,
      lastJobAt: worker.lastJobAt,
      lastError: worker.lastError,
    }));
  }

  async runFeatureTask(input: FeatureTaskInput): Promise<MicrostructureFeatures> {
    return this.enqueue('feature', input, 15_000);
  }

  async runPatternTask(input: PatternTaskInput): Promise<PatternMatchResult[]> {
    return this.enqueue('pattern', input, 15_000);
  }

  async runBacktestTask(input: BacktestTaskInput): Promise<BacktestRunResult> {
    return this.enqueue('backtest', input, 60_000);
  }

  public getWorkerRuntimeMetadata(type: WorkerTaskType): WorkerRuntimeMetadata {
    const workerPath = this.resolveWorkerPath(type);
    return {
      type,
      workerPath,
      useTsxCli: workerPath.endsWith('.ts'),
    };
  }

  private resolveWorkerPath(type: WorkerTaskType): string {
    const fileName =
      type === 'feature'
        ? 'featureWorker'
        : type === 'pattern'
          ? 'patternWorker'
          : 'backtestWorker';

    const distWorkerFromRepoRoot = path.resolve(__dirname, '../../dist/workers', `${fileName}.js`);
    const preferDistWorkers = process.env.CUKONG_PREFER_DIST_WORKERS === '1';

    const candidates = preferDistWorkers
      ? [
          distWorkerFromRepoRoot,
          path.resolve(__dirname, '../workers', `${fileName}.js`),
          path.resolve(__dirname, '../workers', `${fileName}.ts`),
          path.resolve(__dirname, '../../src/workers', `${fileName}.ts`),
        ]
      : [
          path.resolve(__dirname, '../workers', `${fileName}.js`),
          path.resolve(__dirname, '../workers', `${fileName}.ts`),
          distWorkerFromRepoRoot,
          path.resolve(__dirname, '../../src/workers', `${fileName}.ts`),
        ];

    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }

    throw new Error(
      `Worker entrypoint not found for ${type}. Checked: ${candidates.join(', ')}`,
    );
  }

  private createWorker(type: WorkerTaskType): WorkerWrapper {
    const runtimeMetadata = this.getWorkerRuntimeMetadata(type);
    const { workerPath, useTsxCli } = runtimeMetadata;

    const worker = useTsxCli
      ? new Worker(require.resolve('tsx/cli'), {
          argv: [workerPath],
          execArgv: [],
        })
      : new Worker(workerPath, {
          execArgv: [],
        });

    log.info({ type, workerPath, useTsxCli }, 'worker thread created');

    const wrapper: WorkerWrapper = {
      workerId: `${type}-${randomUUID()}`,
      type,
      worker,
      busy: false,
      currentJobId: null,
      jobsProcessed: 0,
      lastJobAt: null,
      lastError: null,
    };

    worker.on('message', (message) => {
      this.onWorkerMessage(wrapper, message as WorkerMessage<unknown>);
    });

    worker.on('error', (error) => {
      wrapper.lastError = error.message;
      log.error({ workerId: wrapper.workerId, type: wrapper.type, error }, 'worker thread failed');
      this.failCurrentJob(wrapper, error);
    });

    worker.on('exit', (code) => {
      const expectedExit = this.expectedExitWorkerIds.delete(wrapper.workerId);
      if (expectedExit) {
        return;
      }

      if (code !== 0) {
        wrapper.lastError = `worker exited with code ${code}`;
        log.error(
          {
            workerId: wrapper.workerId,
            type: wrapper.type,
            code,
            currentJobId: wrapper.currentJobId,
          },
          'worker thread exited unexpectedly',
        );
        this.failCurrentJob(wrapper, new Error(wrapper.lastError));
      }
    });

    return wrapper;
  }

  private failCurrentJob(wrapper: WorkerWrapper, error: Error): void {
    if (!wrapper.currentJobId) {
      return;
    }

    const job = this.jobs.get(wrapper.currentJobId);
    if (!job) {
      return;
    }

    if (job.timeout) {
      clearTimeout(job.timeout);
    }

    this.jobs.delete(wrapper.currentJobId);
    wrapper.busy = false;
    wrapper.currentJobId = null;
    log.error({ workerId: wrapper.workerId, type: wrapper.type, error }, 'worker job failed');
    job.reject(error);
    this.dispatch();
  }

  private async respawnWorker(wrapper: WorkerWrapper): Promise<void> {
    const index = this.workers.findIndex((item) => item.workerId === wrapper.workerId);
    if (index < 0) {
      return;
    }

    wrapper.busy = false;
    wrapper.currentJobId = null;

    try {
      this.expectedExitWorkerIds.add(wrapper.workerId);
      await wrapper.worker.terminate();
    } catch {
      // best effort cleanup
    }

    if (!this.started) {
      this.workers.splice(index, 1);
      return;
    }

    log.warn({ workerId: wrapper.workerId, type: wrapper.type }, 'respawning worker thread');
    this.workers.splice(index, 1, this.createWorker(wrapper.type));
    this.dispatch();
  }

  private onWorkerMessage(wrapper: WorkerWrapper, message: WorkerMessage<unknown>): void {
    const job = this.jobs.get(message.id);
    if (!job) {
      return;
    }

    if (job.timeout) {
      clearTimeout(job.timeout);
    }

    this.jobs.delete(message.id);
    wrapper.busy = false;
    wrapper.currentJobId = null;
    wrapper.jobsProcessed += 1;
    wrapper.lastJobAt = new Date().toISOString();

    if (message.error) {
      wrapper.lastError = message.error;
      job.reject(new Error(message.error));
    } else {
      job.resolve(message.result as never);
    }

    this.dispatch();
  }

  private async runInline(type: 'feature', payload: FeatureTaskInput): Promise<MicrostructureFeatures>;
  private async runInline(type: 'pattern', payload: PatternTaskInput): Promise<PatternMatchResult[]>;
  private async runInline(type: 'backtest', payload: BacktestTaskInput): Promise<BacktestRunResult>;
  private async runInline(
    type: WorkerTaskType,
    payload: WorkerTaskPayloadMap[WorkerTaskType],
  ): Promise<MicrostructureFeatures | PatternMatchResult[] | BacktestRunResult> {
    switch (type) {
      case 'feature': {
        const input = payload as FeatureTaskInput;
        return this.featurePipeline.build(
          input.snapshot,
          input.signal,
          input.recentSnapshots,
        );
      }
      case 'pattern':
        return this.patternMatcher.match(payload as PatternTaskInput);
      case 'backtest':
        return simulateBacktestReplay(payload as BacktestTaskInput);
      default:
        throw new Error(`Unsupported worker task: ${String(type)}`);
    }
  }

  private enqueue<T extends WorkerTaskType>(
    type: T,
    payload: WorkerTaskPayloadMap[T],
    timeoutMs: number,
  ): Promise<WorkerTaskResultMap[T]> {
    if (!this.started) {
      return this.runInline(type as never, payload as never) as Promise<WorkerTaskResultMap[T]>;
    }

    return new Promise<WorkerTaskResultMap[T]>((resolve, reject) => {
      const id = randomUUID();

      const job: QueuedJob<T> = {
        id,
        type,
        payload,
        timeout: null,
        resolve,
        reject,
      };

      job.timeout = setTimeout(() => {
        this.jobs.delete(id);
        const index = this.queue.findIndex((item) => item.id === id);
        if (index >= 0) {
          this.queue.splice(index, 1);
        }

        const owner = this.workers.find((worker) => worker.currentJobId === id);
        if (owner) {
          owner.lastError = `worker task timeout: ${type}`;
          log.error(
            { workerId: owner.workerId, type, timeoutMs },
            'worker task timed out; respawning worker',
          );
          void this.respawnWorker(owner);
        }

        reject(new Error(`Worker task timeout: ${type}`));
      }, timeoutMs);

      this.jobs.set(id, job as unknown as AnyQueuedJob);
      this.queue.push(job as unknown as AnyQueuedJob);
      this.dispatch();
    });
  }

  private dispatch(): void {
    for (const worker of this.workers) {
      if (worker.busy) {
        continue;
      }

      const queueIndex = this.queue.findIndex((job) => job.type === worker.type);
      if (queueIndex < 0) {
        continue;
      }

      const job = this.queue.splice(queueIndex, 1)[0];
      worker.busy = true;
      worker.currentJobId = job.id;
      worker.worker.postMessage({ id: job.id, payload: job.payload });
    }
  }
}
