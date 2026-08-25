import pg from 'pg';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';

const { Pool } = pg;

export type Queryable = Pick<PoolClient, 'query'>;

export class Database {
  readonly #pool: pg.Pool;

  constructor(connectionString: string) {
    this.#pool = new Pool({
      connectionString,
      max: 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      application_name: 'genflow',
    });
  }

  query<R extends QueryResultRow>(text: string, values: readonly unknown[] = []): Promise<QueryResult<R>> {
    return this.#pool.query<R>(text, [...values]);
  }

  async transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.#pool.connect();
    try {
      await client.query('BEGIN');
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.#pool.end();
  }
}
