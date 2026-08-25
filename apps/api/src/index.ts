import 'dotenv/config';
import { createAssetStorage } from '@genflow/asset-storage';
import { Database, GenFlowRepository } from '@genflow/database';
import {
  createComfyUiProvider,
  createMockProvider,
  ProviderRegistry,
} from '@genflow/provider-sdk';
import { buildApp } from './app.js';
import { loadApiConfig } from './config.js';
import { EventBroker } from './event-broker.js';
import { ExecutionQueue } from './execution-queue.js';

const config = loadApiConfig();
const database = new Database(config.DATABASE_URL);
const repository = new GenFlowRepository(database);
const queue = new ExecutionQueue(config.REDIS_URL);
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

const app = await buildApp({ config, repository, queue, events, providers, storage });

const shutdown = async (): Promise<void> => {
  await app.close();
  await Promise.all([queue.close(), events.close(), database.close()]);
};
process.once('SIGTERM', () => void shutdown());
process.once('SIGINT', () => void shutdown());

await app.listen({ host: config.API_HOST, port: config.API_PORT });
