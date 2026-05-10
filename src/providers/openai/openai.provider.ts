import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import Bottleneck from 'bottleneck';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class OpenAIProvider {
  private readonly logger = new Logger(OpenAIProvider.name);
  private readonly limiter: Bottleneck;
  private readonly defaultModel: string;

  constructor(private readonly config: ConfigService) {
    const concurrency = Number(config.get<number>('OPENAI_MAX_CONCURRENCY') ?? 2);
    const perMin = Number(config.get<number>('OPENAI_RATE_LIMIT_PER_MIN') ?? 60);
    const minTime = Math.max(1, Math.floor(60000 / perMin));

    this.defaultModel = String(config.get('OPENAI_DEFAULT_MODEL') ?? 'gpt-4o-mini');
    this.limiter = new Bottleneck({ maxConcurrent: concurrency, minTime });
  }

  private getKey(tenantApiKey?: string): string {
    return tenantApiKey ?? (this.config.get<string>('OPENAI_API_KEY') as string);
  }

  async createChatCompletion(params: { tenantId: string; messages: unknown[]; model?: string; tenantApiKey?: string; maxTokens?: number }) {
    const apiKey = this.getKey(params.tenantApiKey);
    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const payload = {
      model: params.model ?? this.defaultModel,
      messages: params.messages,
      max_tokens: params.maxTokens ?? 512,
    } as any;

    return this.limiter.schedule(async () => {
      try {
        const res = await axios.post('https://api.openai.com/v1/chat/completions', payload, {
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          timeout: 120000,
        });

        return res.data;
      } catch (err: any) {
        this.logger.error('OpenAI request failed', err?.message ?? err);
        throw err;
      }
    });
  }
}
