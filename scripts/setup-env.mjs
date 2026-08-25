import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const examplePath = resolve(root, '.env.example');
const outputPath = resolve(root, '.env');
const force = process.argv.includes('--force');

if (existsSync(outputPath) && !force) {
  console.error('Refusing to overwrite .env. Re-run with --force to rotate local credentials.');
  process.exitCode = 1;
} else {
  const postgresPassword = randomBytes(24).toString('base64url');
  const minioUser = `genflow-${randomBytes(6).toString('hex')}`;
  const minioPassword = randomBytes(32).toString('base64url');
  const replacements = new Map([
    ['POSTGRES_PASSWORD', postgresPassword],
    [
      'DATABASE_URL',
      `postgresql://genflow:${encodeURIComponent(postgresPassword)}@localhost:5432/genflow`,
    ],
    ['JWT_SECRET', randomBytes(48).toString('base64url')],
    ['CREDENTIAL_ENCRYPTION_KEY', randomBytes(32).toString('base64')],
    ['MINIO_ROOT_USER', minioUser],
    ['MINIO_ROOT_PASSWORD', minioPassword],
    ['S3_ACCESS_KEY_ID', minioUser],
    ['S3_SECRET_ACCESS_KEY', minioPassword],
  ]);

  const template = readFileSync(examplePath, 'utf8');
  const environment = template
    .split('\n')
    .map((line) => {
      const separator = line.indexOf('=');
      if (separator < 0) return line;
      const key = line.slice(0, separator);
      return replacements.has(key) ? `${key}=${replacements.get(key)}` : line;
    })
    .join('\n');

  writeFileSync(outputPath, environment, { encoding: 'utf8', mode: 0o600 });
  console.log('Created .env with fresh local-only credentials.');
}
