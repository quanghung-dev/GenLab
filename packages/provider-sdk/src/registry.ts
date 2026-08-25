import { AppError } from '@genflow/shared';
import type { Capability, ProviderDescriptor } from '@genflow/workflow-types';
import type { CapabilityProviderMap, ProviderPlugin } from './contracts.js';
import { toProviderDescriptor } from './contracts.js';

export class ProviderRegistry {
  readonly #providers = new Map<string, ProviderPlugin>();

  register(provider: ProviderPlugin): void {
    if (this.#providers.has(provider.id)) {
      throw new AppError({
        code: 'CONFLICT',
        message: `Provider '${provider.id}' is already registered.`,
        statusCode: 409,
      });
    }
    this.#providers.set(provider.id, provider);
  }

  list(): readonly ProviderDescriptor[] {
    return [...this.#providers.values()].map(toProviderDescriptor);
  }

  get(providerId: string): ProviderPlugin {
    const provider = this.#providers.get(providerId);
    if (!provider || !provider.enabled) {
      throw new AppError({
        code: 'PROVIDER_UNAVAILABLE',
        message: `Provider '${providerId}' is not available.`,
        statusCode: 422,
        retryable: false,
      });
    }
    return provider;
  }

  resolve<C extends Capability>(providerId: string, capability: C): CapabilityProviderMap[C] {
    const provider = this.get(providerId);
    const handler = provider.handlers[capability];
    if (!handler) {
      throw new AppError({
        code: 'PROVIDER_UNAVAILABLE',
        message: `Provider '${providerId}' does not support '${capability}'.`,
        statusCode: 422,
        retryable: false,
      });
    }
    return handler;
  }
}
