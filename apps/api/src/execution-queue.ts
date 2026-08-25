import { Queue } from 'bullmq';

export interface ExecutionJobData {
  readonly executionId: string;
  readonly workspaceId: string;
}

export class ExecutionQueue {
  readonly #queue: Queue<ExecutionJobData>;

  constructor(redisUrl: string) {
    this.#queue = new Queue<ExecutionJobData>('workflow-executions', {
      connection: { url: redisUrl },
      defaultJobOptions: {
        removeOnComplete: 1_000,
        removeOnFail: 5_000,
      },
    });
  }

  async enqueue(data: ExecutionJobData): Promise<void> {
    await this.#queue.add('execute-workflow', data, {
      jobId: `${data.executionId}:${Date.now()}`,
      attempts: 1,
    });
  }

  async close(): Promise<void> {
    await this.#queue.close();
  }
}
