import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';

import { RedisService } from '../core/redis/redis.module';
import { QueueNames } from '../queues/queue.module';
import { OpenAIProvider } from '../providers/openai/openai.provider';
import { MessagesService } from '../modules/messages/messages.module';
import { ConfigService } from '@nestjs/config';

interface AiJobData {
  tenantId: string;
  conversationId: string;
  providerId: string;
  to: string;
  prompt: string;
  options?: Record<string, unknown>;
}

@Injectable()
export class AiProcessingWorker implements OnModuleInit, OnModuleDestroy {
  private worker?: Worker;

  constructor(
    private readonly redisService: RedisService,
    private readonly openai: OpenAIProvider,
    private readonly messagesService: MessagesService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const concurrency = Number(this.config.get<number>('OPENAI_MAX_CONCURRENCY') ?? 2);

    this.worker = new Worker<AiJobData>(
      QueueNames.AiProcessing,
      async (job) => this.process(job.data),
      {
        connection: this.redisService.connection,
        concurrency,
      },
    );

    this.worker.on('failed', (job, err) => {
      // basic logging; failed jobs will be retried per job options
      this.openai['logger']?.error?.(`AI job failed: ${job?.id} - ${err?.message ?? err}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }

  private async process(data: AiJobData): Promise<void> {
    const messages = [
      { role: 'user', content: data.prompt },
    ];

    const resp = await this.openai.createChatCompletion({ tenantId: data.tenantId, messages });

    // Extract text from response (compatible with chat.completions v1)
    const text = Array.isArray(resp.choices) && resp.choices[0]?.message?.content
      ? resp.choices[0].message.content
      : resp.choices?.[0]?.text ?? JSON.stringify(resp);

    // send outgoing message through MessagesService to follow the normal pipeline
    await this.messagesService.sendOutgoing(data.tenantId, {
      conversationId: data.conversationId,
      providerId: data.providerId,
      to: data.to,
      content: text,
      fromBot: true,
    });
  }
}
