import { Injectable } from '@nestjs/common';

import type { Job } from 'bullmq';

import { RedisService } from '../core/redis/redis.module';
import { QueueNames, QueueRegistryService } from '../queues/queue.module';
import { BaseWorker } from './base.worker';

interface ProviderEventJobData {
  tenantId: string;
  providerId: string;
  providerType: string;
  payload: Record<string, unknown>;
  externalId?: string;
}

@Injectable()
export class ProviderEventsWorker extends BaseWorker<ProviderEventJobData> {
  constructor(redisService: RedisService, queueRegistryService: QueueRegistryService) {
    super(QueueNames.ProviderEvents, redisService, queueRegistryService);
  }

  protected async process(job: Job<ProviderEventJobData>): Promise<void> {
    const payload = job.data.payload as {
      fromMe?: boolean;
      conversationId?: string;
      content?: string;
      text?: string;
      messageId?: string;
    };

    if (payload.conversationId && (payload.content ?? payload.text)) {
      await this.queueRegistryService.add(QueueNames.IncomingMessages, 'message.incoming', {
        tenantId: job.data.tenantId,
        conversationId: payload.conversationId,
        providerId: job.data.providerId,
        content: payload.content ?? payload.text ?? '',
        externalMessageId: payload.messageId,
        fromMe: payload.fromMe,
      });
    }
  }
}