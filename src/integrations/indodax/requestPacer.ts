import { createChildLogger } from '../../core/logger';

export interface RequestPacerLaneConfig {
  priority: number;
  minIntervalMs: number;
  maxQueueDepth?: number;
}

export interface RequestPacerTaskOptions {
  lane: string;
  label: string;
  requestPriority?: number;
  coalesceKey?: string;
}

interface PendingTask<T> {
  id: number;
  lane: string;
  label: string;
  priority: number;
  enqueuedAt: number;
  coalesceKey?: string;
  run: () => Promise<T>;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
}

interface LaneState {
  name: string;
  priority: number;
  minIntervalMs: number;
  maxQueueDepth?: number;
  nextAllowedAtMs: number;
  queue: Array<PendingTask<unknown>>;
  coalescedPending: Map<string, Promise<unknown>>;
}

const log = createChildLogger({ module: 'request-pacer' });

export class RequestPacer {
  private readonly lanes = new Map<string, LaneState>();
  private running = false;
  private wakeUpTimer: NodeJS.Timeout | null = null;
  private sequence = 0;

  constructor(
    laneConfig: Record<string, RequestPacerLaneConfig>,
    private readonly scopeLabel: string,
  ) {
    for (const [name, config] of Object.entries(laneConfig)) {
      this.lanes.set(name, {
        name,
        priority: config.priority,
        minIntervalMs: Math.max(0, Math.trunc(config.minIntervalMs)),
        maxQueueDepth: config.maxQueueDepth,
        nextAllowedAtMs: 0,
        queue: [],
        coalescedPending: new Map(),
      });
    }
  }

  schedule<T>(options: RequestPacerTaskOptions, run: () => Promise<T>): Promise<T> {
    const lane = this.lanes.get(options.lane);
    if (!lane) {
      throw new Error(`Unknown pacing lane: ${options.lane}`);
    }

    if (options.coalesceKey) {
      const existing = lane.coalescedPending.get(options.coalesceKey);
      if (existing) {
        log.debug(
          {
            scope: this.scopeLabel,
            lane: options.lane,
            label: options.label,
            priority: lane.priority,
            queueDepth: lane.queue.length,
            coalesceKey: options.coalesceKey,
          },
          'request coalesced into pending lane task',
        );
        return existing as Promise<T>;
      }
    }

    if (lane.maxQueueDepth !== undefined && lane.queue.length >= lane.maxQueueDepth) {
      const dropped = lane.queue.shift();
      if (dropped) {
        dropped.reject(new Error(`Request dropped by pacing guard in lane ${lane.name}`));
        log.warn(
          {
            scope: this.scopeLabel,
            lane: options.lane,
            droppedLabel: dropped.label,
            droppedPriority: dropped.priority,
            queueDepth: lane.queue.length,
          },
          'request dropped because lane queue depth limit exceeded',
        );
      }
    }

    const taskPromise = new Promise<T>((resolve, reject) => {
      lane.queue.push({
        id: ++this.sequence,
        lane: lane.name,
        label: options.label,
        priority: lane.priority + (options.requestPriority ?? 0),
        enqueuedAt: Date.now(),
        coalesceKey: options.coalesceKey,
        run,
        resolve: (value) => resolve(value as T),
        reject,
      });
    });

    if (options.coalesceKey) {
      lane.coalescedPending.set(options.coalesceKey, taskPromise as Promise<unknown>);
      void taskPromise
        .finally(() => {
          const current = lane.coalescedPending.get(options.coalesceKey!);
          if (current === (taskPromise as Promise<unknown>)) {
            lane.coalescedPending.delete(options.coalesceKey!);
          }
        })
        .catch(() => undefined);
    }

    this.drain();
    return taskPromise;
  }

  private getTotalQueueDepth(): number {
    let depth = 0;
    for (const lane of this.lanes.values()) {
      depth += lane.queue.length;
    }
    return depth;
  }

  private pickNextTask(now: number): { lane: LaneState; task: PendingTask<unknown> } | null {
    let selectedLane: LaneState | null = null;
    let selectedTask: PendingTask<unknown> | null = null;

    for (const lane of this.lanes.values()) {
      if (lane.queue.length === 0 || lane.nextAllowedAtMs > now) {
        continue;
      }

      const candidate = lane.queue[0];
      if (!selectedTask || candidate.priority > selectedTask.priority) {
        selectedLane = lane;
        selectedTask = candidate;
      }
    }

    if (!selectedLane || !selectedTask) {
      return null;
    }

    selectedLane.queue.shift();
    return { lane: selectedLane, task: selectedTask };
  }

  private scheduleWakeup(now: number): void {
    if (this.wakeUpTimer) {
      return;
    }

    let nearest = Number.POSITIVE_INFINITY;
    for (const lane of this.lanes.values()) {
      if (lane.queue.length === 0) {
        continue;
      }
      nearest = Math.min(nearest, lane.nextAllowedAtMs);
    }

    if (!Number.isFinite(nearest)) {
      return;
    }

    const waitMs = Math.max(1, nearest - now);
    this.wakeUpTimer = setTimeout(() => {
      this.wakeUpTimer = null;
      this.drain();
    }, waitMs);
  }

  private drain(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    void this.runLoop().finally(() => {
      this.running = false;
    });
  }

  private async runLoop(): Promise<void> {
    while (true) {
      const now = Date.now();
      const selected = this.pickNextTask(now);
      if (!selected) {
        this.scheduleWakeup(now);
        return;
      }

      const { lane, task } = selected;
      const holdMs = Math.max(0, now - task.enqueuedAt);
      if (holdMs > 0) {
        log.info(
          {
            scope: this.scopeLabel,
            lane: lane.name,
            label: task.label,
            priority: task.priority,
            holdMs,
            queueDepth: lane.queue.length,
            totalQueueDepth: this.getTotalQueueDepth(),
          },
          'request released after pacing hold',
        );
      }

      lane.nextAllowedAtMs = Date.now() + lane.minIntervalMs;

      try {
        const result = await task.run();
        task.resolve(result);
      } catch (error) {
        task.reject(error);
      }
    }
  }
}
