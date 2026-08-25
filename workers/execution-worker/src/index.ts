import 'dotenv/config';
import { Worker } from 'bullmq';
import { createAssetStorage } from '@genflow/asset-storage';
import { Database, GenFlowRepository } from '@genflow/database';
import {
  createComfyUiProvider,
  createMockProvider,
  ProviderRegistry,
} from '@genflow/provider-sdk';
import { loadWorkerConfig } from './config.js';
import { processExecution } from './processor.js';
import { EventBroker } from './redis-events.js';

interface ExecutionJobData {
  readonly executionId: string;
  readonly workspaceId: string;
}

const config = loadWorkerConfig();
const database = new Database(config.DATABASE_URL);
const repository = new GenFlowRepository(database);
const events = new EventBroker(config.REDIS_URL);
const storage = createAssetStorage({
  driver: config.ASSET_DRIVER,
  localPath: config.LOCAL_ASSET_PATH,
  s3: {
    region: config.S3_REGION,
    bucket: config.S3_BUCKET,
    ...(config.S3_ENDPOINT ? { endpoint: config.S3_ENDPOINT } : {}),
    ...(config.S3_ACCESS_KEY_ID ? { accessKeyId: config.S3_ACCESS_KEY_ID } : {}),
    ...(config.S3_SECRET_ACCESS_KEY ? { secretAccessKey: config.S3_SECRET_ACCESS_KEY } : {}),
    forcePathStyle: config.S3_FORCE_PATH_STYLE,
  },
});
const providers = new ProviderRegistry();
if (config.MOCK_MODE) providers.register(createMockProvider());
if (config.COMFYUI_BASE_URL) {
  providers.register(
    createComfyUiProvider({
      baseUrl: config.COMFYUI_BASE_URL,
      allowPrivateNetwork: config.COMFYUI_ALLOW_PRIVATE_NETWORK,
    }),
  );
}

const worker = new Worker<ExecutionJobData>(
  'workflow-executions',
  async (job) => {
    await processExecution(job.data.executionId, {
      repository,
      providers,
      storage,
      events,
      credentialEncryptionKey: config.CREDENTIAL_ENCRYPTION_KEY,
      maxParallelNodes: config.WORKER_CONCURRENCY,
    });
  },
  {
    connection: { url: config.REDIS_URL },
    concurrency: config.WORKER_CONCURRENCY,
    lockDuration: 30_000,
    stalledInterval: 30_000,
  },
);

worker.on('failed', (job, error) => {
  process.stderr.write(`Execution job ${job?.id ?? 'unknown'} failed: ${error.message}\n`);
});

const shutdown = async (): Promise<void> => {
  await worker.close();
  await Promise.all([events.close(), database.close()]);
};
process.once('SIGTERM', () => void shutdown());
process.once('SIGINT', () => void shutdown());
