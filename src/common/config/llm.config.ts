import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

/**
 * Creates an OpenAI-compatible client pointed at an Ollama/llama gateway.
 * Configure via env: OLLAMA_BASE_URL (e.g. http://gateway/v1), OLLAMA_API_KEY.
 */
export const createLlmClient = (configService: ConfigService): OpenAI =>
  new OpenAI({
    baseURL: configService.get<string>('OLLAMA_BASE_URL'),
    apiKey: configService.get<string>('OLLAMA_API_KEY') ?? 'ollama',
  });

/** The model served by the gateway, e.g. qwen2.5:7b. */
export const getLlmModel = (configService: ConfigService): string =>
  configService.get<string>('OLLAMA_MODEL') ?? 'qwen2.5:7b';
