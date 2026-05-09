import { Inject, Injectable } from '@nestjs/common';

import type { Job } from 'bullmq';

import { RedisService } from '../core/redis/redis.module';
import { JobStatus, ScheduledJobsRepository, ScheduledJobsService } from '../jobs/jobs.module';
import { MESSAGING_PROVIDER, type MessagingProvider, type ProviderContext, ProviderType } from '../providers/providers.module';
import { QueueNames, QueueRegistryService } from '../queues/queue.module';
import { ConversationsRepository } from '../modules/conversations/conversations.module';
import { MessagesRepository, MessageStatus } from '../modules/messages/messages.module';
import { BaseWorker } from './base.worker';

interface OutgoingMessageJobData {
  tenantId: string;
  messageId: string;
  conversationId: string;
  providerId: string;
  to: string;
  scheduledJobId: string;
}

@Injectable()
export class OutgoingMessageWorker extends BaseWorker<OutgoingMessageJobData> {
  constructor(
    redisService: RedisService,
    queueRegistryService: QueueRegistryService,
    private readonly conversationsRepository: ConversationsRepository,
    private readonly messagesRepository: MessagesRepository,
    private readonly scheduledJobsRepository: ScheduledJobsRepository,
    private readonly scheduledJobsService: ScheduledJobsService,
    @Inject(MESSAGING_PROVIDER) private readonly messagingProvider: MessagingProvider,
  ) {
    super(QueueNames.OutgoingMessages, redisService, queueRegistryService);
  }

  protected async process(job: Job<OutgoingMessageJobData>): Promise<void> {
    const scheduledJob = await this.scheduledJobsRepository.findById(job.data.tenantId, job.data.scheduledJobId);
    if (!scheduledJob || scheduledJob.status === JobStatus.Cancelled) {
      return;
    }

    const conversation = await this.conversationsRepository.findById(job.data.tenantId, job.data.conversationId);
    if (!conversation) {
      await this.scheduledJobsService.markFailed(job.data.tenantId, job.data.scheduledJobId, 'Conversation not found');
      return;
    }

    if (conversation.mode !== 'BOT') {
      await this.scheduledJobsService.markCancelled(job.data.tenantId, job.data.scheduledJobId);
      await this.messagesRepository.updateStatus(job.data.tenantId, job.data.messageId, MessageStatus.Cancelled);
      return;
    }

    const provider = {
      id: job.data.providerId,
      tenantId: job.data.tenantId,
      type: ProviderType.EvolutionApi,
      name: 'evolution',
      externalId: undefined,
      config: {},
    } as ProviderContext;

    const message = await this.messagesRepository.findById(job.data.tenantId, job.data.messageId);
    await this.messagingProvider.sendText({
      provider,
      to: job.data.to,
      text: message?.content ?? '',
      conversationId: job.data.conversationId,
    });

    await this.messagesRepository.updateStatus(job.data.tenantId, job.data.messageId, MessageStatus.Sent, {
      sentAt: new Date(),
    });
    await this.scheduledJobsService.markCompleted(job.data.tenantId, job.data.scheduledJobId);
  }
}