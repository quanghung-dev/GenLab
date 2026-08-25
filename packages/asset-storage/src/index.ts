import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { AppError } from '@genflow/shared';

export interface StoredAsset {
  readonly storageKey: string;
  readonly sizeBytes: number;
}

export interface AssetStorage {
  put(storageKey: string, content: Uint8Array, mimeType: string): Promise<StoredAsset>;
  get(storageKey: string): Promise<Uint8Array>;
}

function assertStorageKey(storageKey: string): void {
  if (
    storageKey.length === 0 ||
    storageKey.length > 1_024 ||
    isAbsolute(storageKey) ||
    storageKey.split('/').some((segment) => segment === '..' || segment === '')
  ) {
    throw new AppError({ code: 'INVALID_INPUT', message: 'Invalid asset storage key.', statusCode: 400 });
  }
}

export class LocalAssetStorage implements AssetStorage {
  readonly #root: string;

  constructor(root: string) {
    this.#root = resolve(root);
  }

  #path(storageKey: string): string {
    assertStorageKey(storageKey);
    const path = resolve(this.#root, storageKey);
    if (relative(this.#root, path).startsWith('..')) {
      throw new AppError({ code: 'FORBIDDEN', message: 'Asset path escapes the storage root.', statusCode: 403 });
    }
    return path;
  }

  async put(storageKey: string, content: Uint8Array): Promise<StoredAsset> {
    const path = this.#path(storageKey);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, { flag: 'wx' });
    return { storageKey, sizeBytes: content.byteLength };
  }

  async get(storageKey: string): Promise<Uint8Array> {
    try {
      return await readFile(this.#path(storageKey));
    } catch (error) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Asset content not found.', statusCode: 404, cause: error });
    }
  }
}

export interface S3AssetStorageOptions {
  readonly endpoint?: string;
  readonly region: string;
  readonly bucket: string;
  readonly accessKeyId?: string;
  readonly secretAccessKey?: string;
  readonly forcePathStyle?: boolean;
}

export class S3AssetStorage implements AssetStorage {
  readonly #client: S3Client;
  readonly #bucket: string;

  constructor(options: S3AssetStorageOptions) {
    this.#bucket = options.bucket;
    this.#client = new S3Client({
      region: options.region,
      ...(options.endpoint ? { endpoint: options.endpoint } : {}),
      forcePathStyle: options.forcePathStyle ?? false,
      ...(options.accessKeyId && options.secretAccessKey
        ? { credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey } }
        : {}),
    });
  }

  async put(storageKey: string, content: Uint8Array, mimeType: string): Promise<StoredAsset> {
    assertStorageKey(storageKey);
    await this.#client.send(
      new PutObjectCommand({
        Bucket: this.#bucket,
        Key: storageKey,
        Body: content,
        ContentType: mimeType,
      }),
    );
    return { storageKey, sizeBytes: content.byteLength };
  }

  async get(storageKey: string): Promise<Uint8Array> {
    assertStorageKey(storageKey);
    const response = await this.#client.send(new GetObjectCommand({ Bucket: this.#bucket, Key: storageKey }));
    if (!response.Body) throw new AppError({ code: 'NOT_FOUND', message: 'Asset content not found.', statusCode: 404 });
    return response.Body.transformToByteArray();
  }
}

export function createAssetStorage(options: {
  driver: 'local' | 's3';
  localPath: string;
  s3: S3AssetStorageOptions;
}): AssetStorage {
  return options.driver === 'local' ? new LocalAssetStorage(options.localPath) : new S3AssetStorage(options.s3);
}
