import type { JsonValue, ProviderModelDescriptor } from '@genflow/workflow-types';
import type {
  GeneratedArtifact,
  ImageGenerationInput,
  ProviderExecutionContext,
  ProviderPlugin,
  TextGenerationInput,
  TextGenerationOutput,
  VideoGenerationInput,
} from './contracts.js';

const MOCK_VIDEO_BASE64 =
  'AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAO0bW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAAZAAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAt50cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAAZAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAUAAAAC0AAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAGQAAAEAAABAAAAAAJWbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAAAyAAAAFABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAACAW1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAcFzdGJsAAAAwXN0c2QAAAAAAAAAAQAAALFhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAUAAtABIAAAASAAAAAAAAAABFUxhdmM2MC4zMS4xMDIgbGlieDI2NAAAAAAAAAAAAAAAGP//AAAAN2F2Y0MBZAAM/+EAGmdkAAys2UFBn58BEAAAAwAQAAADAyDxQplgAQAGaOvjyyLA/fj4AAAAABBwYXNwAAAAAQAAAAEAAAAUYnRydAAAAAAAAJYAAACWAAAAABhzdHRzAAAAAAAAAAEAAAAKAAACAAAAABRzdHNzAAAAAAAAAAEAAAABAAAAYGN0dHMAAAAAAAAACgAAAAEAAAQAAAAAAQAACgAAAAABAAAEAAAAAAEAAAAAAAAAAQAAAgAAAAABAAAKAAAAAAEAAAQAAAAAAQAAAAAAAAABAAACAAAAAAEAAAQAAAAAHHN0c2MAAAAAAAAAAQAAAAEAAAAKAAAAAQAAADxzdHN6AAAAAAAAAAAAAAAKAAAG6gAAABQAAAAQAAAAEAAAAA0AAAAWAAAADwAAAA0AAAANAAAAFgAAABRzdGNvAAAAAAAAAAEAAAPkAAAAYnVkdGEAAABabWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAbWRpcmFwcGwAAAAAAAAAAAAAAAAtaWxzdAAAACWpdG9vAAAAHWRhdGEAAAABAAAAAExhdmY2MC4xNi4xMDAAAAAIZnJlZQAAB4htZGF0AAACrgYF//+q3EXpvebZSLeWLNgg2SPu73gyNjQgLSBjb3JlIDE2NCByMzEwOCAzMWUxOWY5IC0gSC4yNjQvTVBFRy00IEFWQyBjb2RlYyAtIENvcHlsZWZ0IDIwMDMtMjAyMyAtIGh0dHA6Ly93d3cudmlkZW9sYW4ub3JnL3gyNjQuaHRtbCAtIG9wdGlvbnM6IGNhYmFjPTEgcmVmPTMgZGVibG9jaz0xOjA6MCBhbmFseXNlPTB4MzoweDExMyBtZT1oZXggc3VibWU9NyBwc3k9MSBwc3lfcmQ9MS4wMDowLjAwIG1peGVkX3JlZj0xIG1lX3JhbmdlPTE2IGNocm9tYV9tZT0xIHRyZWxsaXM9MSA4eDhkY3Q9MSBjcW09MCBkZWFkem9uZT0yMSwxMSBmYXN0X3Bza2lwPTEgY2hyb21hX3FwX29mZnNldD0tMiB0aHJlYWRzPTYgbG9va2FoZWFkX3RocmVhZHM9MSBzbGljZWRfdGhyZWFkcz0wIG5yPTAgZGVjaW1hdGU9MSBpbnRlcmxhY2VkPTAgYmx1cmF5X2NvbXBhdD0wIGNvbnN0cmFpbmVkX2ludHJhPTAgYmZyYW1lcz0zIGJfcHlyYW1pZD0yIGJfYWRhcHQ9MSBiX2JpYXM9MCBkaXJlY3Q9MSB3ZWlnaHRiPTEgb3Blbl9nb3A9MCB3ZWlnaHRwPTIga2V5aW50PTI1MCBrZXlpbnRfbWluPTI1IHNjZW5lY3V0PTQwIGludHJhX3JlZnJlc2g9MCByY19sb29rYWhlYWQ9NDAgcmM9Y3JmIG1idHJlZT0xIGNyZj0yMy4wIHFjb21wPTAuNjAgcXBtaW49MCBxcG1heD02OSBxcHN0ZXA9NCBpcF9yYXRpbz0xLjQwIGFxPTE6MS4wMACAAAAENGWIhAA3//7hA/gU17ZeXvVSl1cuRtxKXTNnzkBiPXQVxBGAAJZTkDZ2geVuIPgEqAAASgNadq3P3gj5wxEwA21szEVzqLmcmxoZonxzVUfd0iVnszFXfZ8U0M8tJzNzVkLI6gRkGCWLu625pLWm0u/SKVMtxcC5jRfTa+5CycQ/eVvEb/jSwB9EScncq+WYgjct/DWU7DjK8kFDaodjk6I9cIV2isjs75xsADKF4hln0taJYxst0D59ylERTqwXqc5q3t64abNwHZoHLxHDVR3mkqGwuKu0njk8RTGtTHbr+QFbgO7vEFTXSRGHWcWrwPugGGOnxg9eHfcemRE6EAZx+nSLfGMFE6ZOVnit6SY613+QMOxvSz3KupLX95DuiCY+L8zgV74Tk6tetJMX3xUkTBr6pHzYu+TQz5bVbqzDY+SNjDPeriKnrKa+EW9kD4fN4Y8m+0krYwRBf9ECXpZIhXMIbG3PlF8XRrJ8dNms8InolFAlwGniNBy5ZIQqjlsknrJ1EEWiqMQZtItopaBq1zk4zqqfsYnaq62f2z320Rvh5IU5GZ/DgXz0LO47MdtsEAIrzZVIUNc8l7iMAkISj3+I4Bv1KPZvDABjYMsWeHd/NoZ3DOYset26PX5RqZgO0edXfR9UocpkFJYlNiP3FJ0CMYlRlyTm0WZo6/ko4KrftzBCZvqDifZUni1eM82XJlyOJAs3VhTLhDmbo47NGFrOashX+C9Af9ROvHahHpm1CuczwN9miHl0gwVSUc0QiIDqDckEs8XejxOrqWM1NrY5HzNtxyCac6ScBkx2wpN6Tayp5LPChwc9fi2zjZ2homv4tJ0ZpqYauGOZ4f5MB3m0i90F6yG//5+aH/oSPRtsLmqFwE/KCronXXchvAmQDzLKT2dywo6YaBOdkykgLWfv6+qkoCJQYjNOtpcDjdxu61UgmAfBm00t1TcnJjaHFGpqIb1IFcPsNLkvi8YFiIcvbILDV9hYj9x5ggFuPnvZ7bShvbWKC8Lv0Vbi7EwKEBsJRDGt3fYB+FNVsBU1YxdbW9ow3pjHFXSmaCAtFP1E75TdSOPlJWd9k34Bby05hxa4bG/owV8bNGm2nRiFi3yd/WgQ/mnYxcydG2HbXR3o5jsHkkoEI6yl0Zpg5JaHHyuWRNgJ5wzFur9D1eOX+qRWR2byTYRaVnkg/xbi/0eRdN/BlZUrkIu9wgMcCJ6cNQ5JmvCtSwmrGFLrI88cZACquY7WoDnCxbd+WUifwG/5/mLK3hDmkb0sYwxA9jzgGx+m9eiIyZUTVK5hqNn9kOClYOFgsOs6KDrrhP2Ra63q9CRB0xSZZUGvU/9FEXGqIukC82WIeIn8QT1osMRwrG0sq6Car6N3dGw56D3Bc2yEs8SgVn+M7GUtsAkT5KgGQp8zeOYAqa4SsLQEEXbjRFBtAAAAEEGaJGxDf/6nhADI+yox+9AAAAAMQZ5CeIX/AHa+PrlBAAAADAGeYXRCvwCjpiBqQAAAAAkBnmNqQr8AA1MAAAASQZpoSahBaJlMCF///oywAA+5AAAAC0GehkURLC//AAJvAAAACQGepXRCvwADUwAAAAkBnqdqQr8AA1IAAAASQZqpSahBbJlMCFf//jhAAD0g';

const models: readonly ProviderModelDescriptor[] = [
  { id: 'mock-text-v1', label: 'Mock Text v1', capabilities: ['text.generate'] },
  { id: 'mock-image-v1', label: 'Mock Image v1', capabilities: ['image.generate'] },
  { id: 'mock-video-v1', label: 'Mock Video v1', capabilities: ['video.generate'] },
];

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (character) => {
    const entities: Record<string, string> = {
      '<': '&lt;',
      '>': '&gt;',
      '&': '&amp;',
      "'": '&apos;',
      '"': '&quot;',
    };
    return entities[character] ?? character;
  });
}

function metadata(input: Record<string, JsonValue>): Readonly<Record<string, JsonValue>> {
  return { mock: true, ...input };
}

class MockProviderHandler {
  async generateText(
    input: TextGenerationInput,
    context: ProviderExecutionContext,
  ): Promise<TextGenerationOutput> {
    await context.reportProgress(35, 'Drafting mock response');
    await context.reportProgress(100, 'Mock text complete');
    return {
      text: `Mock generation for: ${input.prompt.trim()}`,
      model: input.model,
      metadata: metadata({ promptLength: input.prompt.length }),
    };
  }

  async generateImage(
    input: ImageGenerationInput,
    context: ProviderExecutionContext,
  ): Promise<GeneratedArtifact> {
    const width = input.width ?? 1024;
    const height = input.height ?? 1024;
    await context.reportProgress(45, 'Rendering mock image');
    const prompt = escapeXml(input.prompt.slice(0, 160));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#151b2d"/><stop offset=".55" stop-color="#5b38ff"/><stop offset="1" stop-color="#00c2a8"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="82%" cy="18%" r="18%" fill="#fff" opacity=".09"/><text x="7%" y="80%" fill="white" font-family="Inter,Arial" font-size="${Math.max(18, width / 30)}" font-weight="600">${prompt}</text><text x="7%" y="88%" fill="#d7d9e4" font-family="Inter,Arial" font-size="${Math.max(13, width / 55)}">GenFlow mock provider · ${escapeXml(input.model)}</text></svg>`;
    await context.reportProgress(100, 'Mock image complete');
    return {
      assetType: 'image',
      mimeType: 'image/svg+xml',
      fileName: `${context.nodeExecutionId}.svg`,
      content: new TextEncoder().encode(svg),
      metadata: metadata({ width, height, model: input.model }),
    };
  }

  async generateVideo(
    input: VideoGenerationInput,
    context: ProviderExecutionContext,
  ): Promise<GeneratedArtifact> {
    await context.reportProgress(30, 'Preparing mock frames');
    await context.reportProgress(70, 'Encoding mock video');
    const content = Uint8Array.from(Buffer.from(MOCK_VIDEO_BASE64, 'base64'));
    await context.reportProgress(100, 'Mock video complete');
    return {
      assetType: 'video',
      mimeType: 'video/mp4',
      fileName: `${context.nodeExecutionId}.mp4`,
      content,
      metadata: metadata({
        width: 320,
        height: 180,
        durationSeconds: 0.4,
        requestedDurationSeconds: input.durationSeconds ?? 4,
        model: input.model,
      }),
    };
  }
}

export function createMockProvider(): ProviderPlugin {
  const handler = new MockProviderHandler();
  return {
    id: 'mock',
    name: 'Mock Provider',
    enabled: true,
    models,
    handlers: {
      'text.generate': handler,
      'image.generate': handler,
      'video.generate': handler,
    },
  };
}
