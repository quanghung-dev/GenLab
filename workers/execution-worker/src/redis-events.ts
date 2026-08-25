import Redis from 'ioredis';
import type { ExecutionEvent } from '@genflow/workflow-types';

export class EventBroker {
  readonly #redis: Redis;

  constructor(redisUrl: string) {
    this.#redis = new Redis(redisUrl, { maxRetriesPerRequest: 3 });
  }

  async publish(event: ExecutionEvent): Promise<void> {
    await this.#redis.publish(`genflow:execution:${event.executionId}`, JSON.stringify(event));
  }

  async close(): Promise<void> {
    await this.#redis.quit();
  }
}
