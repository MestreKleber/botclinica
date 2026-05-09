import { Injectable } from '@nestjs/common';

import type { Job } from 'bullmq';

import { RedisService } from '../core/redis/redis.module';
import { ScheduledJobsService } from '../jobs/jobs.module';
import { QueueNames, QueueRegistryService } from '../queues/queue.module';
import { ConversationsRepository } from '../modules/conversations/conversations.module';
import { MessagesService } from '../modules/messages/messages.module';
import { BaseWorker } from './base.worker';

interface IncomingMessageJobData {
  tenantId: string;
  conversationId: string;
  providerId: string;
  content: string;
  externalMessageId?: string;
  fromMe?: boolean;
}

@Injectable()
export class IncomingMessageWorker extends BaseWorker<IncomingMessageJobData> {
  constructor(
    redisService: RedisService,
    queueRegistryService: QueueRegistryService,
    private readonly messagesService: MessagesService,
    private readonly conversationsRepository: ConversationsRepository,
    private readonly scheduledJobsService: ScheduledJobsService,
  ) {
    super(QueueNames.IncomingMessages, redisService, queueRegistryService);
  }

  protected async process(job: Job<IncomingMessageJobData>): Promise<void> {
    const { tenantId, conversationId, fromMe } = job.data;
    await this.messagesService.recordIncoming(tenantId, {
      conversationId,
      providerId: job.data.providerId,
      content: job.data.content,
      externalMessageId: job.data.externalMessageId,
      fromMe,
    });

    if (fromMe) {
      await this.conversationsRepository.markHumanTakeover(tenantId, conversationId, new Date());
    }
  }
}