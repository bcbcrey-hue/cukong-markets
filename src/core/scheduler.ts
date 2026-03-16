export interface ScheduledJob {
  name: string;
  intervalMs: number;
  run: () => Promise<void>;
  runOnStart?: boolean;
}

interface InternalJob extends ScheduledJob {
  timer: NodeJS.Timeout | null;
  running: boolean;
  runs: number;
  lastStartedAt: number | null;
  lastFinishedAt: number | null;
  lastError: string | null;
}

export interface ScheduledJobStatus {
  name: string;
  intervalMs: number;
  active: boolean;
  running: boolean;
  runs: number;
  lastStartedAt: number | null;
  lastFinishedAt: number | null;
  lastError: string | null;
}

export class LightScheduler {
  private readonly jobs = new Map<string, InternalJob>();

  add(job: ScheduledJob): void {
    if (this.jobs.has(job.name)) {
      throw new Error(`Scheduler job already exists: ${job.name}`);
    }

    this.jobs.set(job.name, {
      ...job,
      timer: null,
      running: false,
      runs: 0,
      lastStartedAt: null,
      lastFinishedAt: null,
      lastError: null,
    });
  }

  has(name: string): boolean {
    return this.jobs.has(name);
  }

  get(name: string): ScheduledJobStatus | null {
    const job = this.jobs.get(name);
    if (!job) {
      return null;
    }

    return this.toStatus(job);
  }

  list(): ScheduledJobStatus[] {
    return Array.from(this.jobs.values()).map((job) => this.toStatus(job));
  }

  async runNow(name: string): Promise<void> {
    const job = this.jobs.get(name);
    if (!job) {
      throw new Error(`Scheduler job not found: ${name}`);
    }

    await this.execute(job);
  }

  start(name?: string): void {
    const selected = this.select(name);

    for (const job of selected) {
      if (job.timer) {
        continue;
      }

      if (job.runOnStart) {
        void this.execute(job);
      }

      job.timer = setInterval(() => {
        void this.execute(job);
      }, job.intervalMs);
    }
  }

  stop(name?: string): void {
    const selected = this.select(name);

    for (const job of selected) {
      if (job.timer) {
        clearInterval(job.timer);
        job.timer = null;
      }
    }
  }

  stopAll(): void {
    this.stop();
  }

  remove(name: string): void {
    this.stop(name);
    this.jobs.delete(name);
  }

  private select(name?: string): InternalJob[] {
    if (name) {
      const job = this.jobs.get(name);
      if (!job) {
        throw new Error(`Scheduler job not found: ${name}`);
      }
      return [job];
    }

    return Array.from(this.jobs.values());
  }

  private async execute(job: InternalJob): Promise<void> {
    if (job.running) {
      return;
    }

    job.running = true;
    job.lastStartedAt = Date.now();

    try {
      await job.run();
      job.runs += 1;
      job.lastError = null;
    } catch (error) {
      job.lastError = error instanceof Error ? error.message : String(error);
    } finally {
      job.lastFinishedAt = Date.now();
      job.running = false;
    }
  }

  private toStatus(job: InternalJob): ScheduledJobStatus {
    return {
      name: job.name,
      intervalMs: job.intervalMs,
      active: job.timer !== null,
      running: job.running,
      runs: job.runs,
      lastStartedAt: job.lastStartedAt,
      lastFinishedAt: job.lastFinishedAt,
      lastError: job.lastError,
    };
  }
}
