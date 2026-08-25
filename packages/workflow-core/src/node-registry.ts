import { AppError } from '@genflow/shared';
import type { NodeDefinition } from '@genflow/workflow-types';

export class NodeRegistry {
  readonly #definitions = new Map<string, NodeDefinition>();

  register(definition: NodeDefinition): void {
    if (this.#definitions.has(definition.type)) {
      throw new AppError({
        code: 'CONFLICT',
        message: `Node type '${definition.type}' is already registered.`,
        statusCode: 409,
      });
    }
    this.#definitions.set(definition.type, definition);
  }

  get(type: string): NodeDefinition | undefined {
    return this.#definitions.get(type);
  }

  require(type: string): NodeDefinition {
    const definition = this.get(type);
    if (!definition) {
      throw new AppError({
        code: 'WORKFLOW_VALIDATION_FAILED',
        message: `Unknown node type '${type}'.`,
        statusCode: 422,
      });
    }
    return definition;
  }

  list(): readonly NodeDefinition[] {
    return [...this.#definitions.values()];
  }
}
