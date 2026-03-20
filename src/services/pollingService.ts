import { LightScheduler } from '../core/scheduler';

export class PollingService {
  constructor(private readonly scheduler: LightScheduler) {}

  register(name: string, intervalMs: number, handler: () => Promise<void>): void {
    this.scheduler.add({ name, intervalMs, run: handler });
  }

  start(name?: string): void {
    this.scheduler.start(name);
  }

  stop(name?: string): void {
    this.scheduler.stop(name);
  }

  stats(): {
    activeJobs: number;
    jobs: { name: string; intervalMs: number; running: boolean }[];
  } {
    const jobs = this.scheduler.list();
    return {
      activeJobs: jobs.filter((job) => job.active).length,
      jobs,
    };
  }
}
