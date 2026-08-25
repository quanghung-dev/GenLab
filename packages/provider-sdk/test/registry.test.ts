import { describe, expect, it } from 'vitest';
import { AppError } from '@genflow/shared';
import { createMockProvider, ProviderRegistry } from '../src/index.js';

describe('ProviderRegistry', () => {
  it('resolves a registered capability without provider-specific branches', () => {
    const registry = new ProviderRegistry();
    registry.register(createMockProvider());

    const provider = registry.resolve('mock', 'text.generate');

    expect(Reflect.get(provider, 'generateText')).toBeTypeOf('function');
  });

  it('rejects an unsupported capability with a stable error code', () => {
    const registry = new ProviderRegistry();
    registry.register(createMockProvider());

    expect(() => registry.resolve('mock', 'audio.generate')).toThrowError(AppError);
    try {
      registry.resolve('mock', 'audio.generate');
    } catch (error) {
      expect(error).toMatchObject({ code: 'PROVIDER_UNAVAILABLE', retryable: false });
    }
  });

  it('prevents accidental provider replacement', () => {
    const registry = new ProviderRegistry();
    registry.register(createMockProvider());

    try {
      registry.register(createMockProvider());
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      if (!(error instanceof AppError)) throw error;
      expect(error.code).toBe('CONFLICT');
      return;
    }
    throw new Error('Expected duplicate provider registration to fail.');
  });
});
