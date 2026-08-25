import { Redis } from 'ioredis';
import type { ExecutionEvent } from '@genflow/workflow-types';

function channel(executionId: string): string {
  return `genflow:execution:${executionId}`;
}

export class EventBroker {
  readonly #redisUrl: string;
  readonly #publisher: Redis;

  constructor(redisUrl: string) {
    this.#redisUrl = redisUrl;
    this.#publisher = new Redis(redisUrl, { maxRetriesPerRequest: 3 });
  }

  async publish(event: ExecutionEvent): Promise<void> {
    await this.#publisher.publish(channel(event.executionId), JSON.stringify(event));
  }

  async subscribe(
    executionId: string,
    listener: (event: ExecutionEvent) => void,
  ): Promise<() => Promise<void>> {
    const subscriber = new Redis(this.#redisUrl, { maxRetriesPerRequest: null });
    const eventChannel = channel(executionId);
    subscriber.on('message', (receivedChannel: string, payload: string) => {
      if (receivedChannel !== eventChannel) return;
      try {
        listener(JSON.parse(payload) as ExecutionEvent);
      } catch {
        // Ignore malformed transient events. Durable logs remain canonical.
      }
    });
    await subscriber.subscribe(eventChannel);
    return async () => {
      await subscriber.unsubscribe(eventChannel);
      subscriber.disconnect();
    };
  }

  async close(): Promise<void> {
    await this.#publisher.quit();
  }
}
