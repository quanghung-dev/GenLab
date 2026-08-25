import { readFile } from 'node:fs/promises';
import { Database } from './database.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required.');

const database = new Database(connectionString);
try {
  await database.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version varchar(120) PRIMARY KEY,
       applied_at timestamptz NOT NULL DEFAULT now()
     )`,
  );
  const applied = await database.query<{ version: string }>(
    `SELECT version FROM schema_migrations WHERE version = '0001_initial'`,
  );
  if (applied.rowCount && applied.rowCount > 0) {
    process.stdout.write('Migration 0001_initial is already applied.\n');
    await database.close();
    process.exit(0);
  }
  const migration = await readFile(new URL('../migrations/0001_initial.sql', import.meta.url), 'utf8');
  await database.transaction(async (client) => {
    await client.query(migration);
    await client.query(
      `INSERT INTO schema_migrations (version) VALUES ('0001_initial') ON CONFLICT DO NOTHING`,
    );
  });
  process.stdout.write('Applied migration 0001_initial.\n');
} finally {
  await database.close();
}
