import type {
  Capability,
  JsonValue,
  ProviderDescriptor,
  ProviderModelDescriptor,
} from '@genflow/workflow-types';

export interface ProviderExecutionContext {
  readonly executionId: string;
  readonly nodeExecutionId: string;
  readonly idempotencyKey: string;
  readonly signal: AbortSignal;
  readonly credentials: Readonly<Record<string, string>>;
  readonly reportProgress: (progress: number, message?: string) => Promise<void>;
}

export interface GeneratedArtifact {
  readonly assetType: 'image' | 'video' | 'audio' | 'document';
  readonly mimeType: string;
  readonly fileName: string;
  readonly content: Uint8Array;
  readonly metadata: Readonly<Record<string, JsonValue>>;
}

export interface TextGenerationInput {
  readonly prompt: string;
  readonly model: string;
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly parameters?: Readonly<Record<string, JsonValue>>;
}

export interface TextGenerationOutput {
  readonly text: string;
  readonly model: string;
  readonly metadata: Readonly<Record<string, JsonValue>>;
}

export interface ImageGenerationInput {
  readonly prompt: string;
  readonly model: string;
  readonly width?: number;
  readonly height?: number;
  readonly seed?: number;
  readonly parameters?: Readonly<Record<string, JsonValue>>;
}

export interface VideoGenerationInput {
  readonly prompt: string;
  readonly model: string;
  readonly sourceImageAssetId?: string;
  readonly durationSeconds?: number;
  readonly width?: number;
  readonly height?: number;
  readonly seed?: number;
  readonly parameters?: Readonly<Record<string, JsonValue>>;
}

export interface AudioGenerationInput {
  readonly prompt: string;
  readonly model: string;
  readonly parameters?: Readonly<Record<string, JsonValue>>;
}

export interface SpeechSynthesisInput {
  readonly text: string;
  readonly model: string;
  readonly voice?: string;
  readonly parameters?: Readonly<Record<string, JsonValue>>;
}

export interface SpeechTranscriptionInput {
  readonly assetId: string;
  readonly model: string;
  readonly parameters?: Readonly<Record<string, JsonValue>>;
}

export interface SpeechTranscriptionOutput {
  readonly text: string;
  readonly metadata: Readonly<Record<string, JsonValue>>;
}

export interface TextGenerationProvider {
  generateText(input: TextGenerationInput, context: ProviderExecutionContext): Promise<TextGenerationOutput>;
}

export interface ImageGenerationProvider {
  generateImage(input: ImageGenerationInput, context: ProviderExecutionContext): Promise<GeneratedArtifact>;
}

export interface VideoGenerationProvider {
  generateVideo(input: VideoGenerationInput, context: ProviderExecutionContext): Promise<GeneratedArtifact>;
}

export interface AudioGenerationProvider {
  generateAudio(input: AudioGenerationInput, context: ProviderExecutionContext): Promise<GeneratedArtifact>;
}

export interface SpeechSynthesisProvider {
  synthesizeSpeech(input: SpeechSynthesisInput, context: ProviderExecutionContext): Promise<GeneratedArtifact>;
}

export interface SpeechTranscriptionProvider {
  transcribeSpeech(
    input: SpeechTranscriptionInput,
    context: ProviderExecutionContext,
  ): Promise<SpeechTranscriptionOutput>;
}

export interface CapabilityProviderMap {
  readonly 'text.generate': TextGenerationProvider;
  readonly 'image.generate': ImageGenerationProvider;
  readonly 'video.generate': VideoGenerationProvider;
  readonly 'audio.generate': AudioGenerationProvider;
  readonly 'speech.synthesize': SpeechSynthesisProvider;
  readonly 'speech.transcribe': SpeechTranscriptionProvider;
}

export type ProviderCapabilityHandlers = {
  readonly [K in Capability]?: CapabilityProviderMap[K];
};

export interface ProviderPlugin {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly models: readonly ProviderModelDescriptor[];
  readonly handlers: ProviderCapabilityHandlers;
}

export function toProviderDescriptor(provider: ProviderPlugin): ProviderDescriptor {
  return {
    id: provider.id,
    name: provider.name,
    enabled: provider.enabled,
    capabilities: Object.keys(provider.handlers) as Capability[],
    models: provider.models,
  };
}
