import { createDecipheriv } from 'node:crypto';
import type { GenFlowRepository } from '@genflow/database';
import { AppError } from '@genflow/shared';
import type { CredentialResolver } from '@genflow/workflow-core';

function decodeKey(encoded: string): Buffer {
  const key = Buffer.from(encoded, 'base64');
  if (key.byteLength !== 32) {
    throw new AppError({
      code: 'INTERNAL_ERROR',
      message: 'CREDENTIAL_ENCRYPTION_KEY must be a base64-encoded 32-byte key.',
    });
  }
  return key;
}

export class DatabaseCredentialResolver implements CredentialResolver {
  readonly #repository: GenFlowRepository;
  readonly #workspaceId: string;
  readonly #key: Buffer;

  constructor(repository: GenFlowRepository, workspaceId: string, encodedKey: string) {
    this.#repository = repository;
    this.#workspaceId = workspaceId;
    this.#key = decodeKey(encodedKey);
  }

  async resolve(credentialId: string | undefined): Promise<Readonly<Record<string, string>>> {
    if (!credentialId) return {};
    const encrypted = await this.#repository.getCredential(this.#workspaceId, credentialId);
    if (!encrypted) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Provider credential not found.', statusCode: 404 });
    }
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.#key, encrypted.iv);
      decipher.setAuthTag(encrypted.authTag);
      const plaintext = Buffer.concat([decipher.update(encrypted.ciphertext), decipher.final()]).toString('utf8');
      const parsed: unknown = JSON.parse(plaintext);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Credential payload is invalid.');
      return Object.fromEntries(
        Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
      );
    } catch (error) {
      throw new AppError({ code: 'PROVIDER_AUTH_ERROR', message: 'Provider credential could not be decrypted.', cause: error });
    }
  }
}
