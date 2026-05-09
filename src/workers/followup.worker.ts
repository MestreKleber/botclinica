import { Inject, Injectable } from '@nestjs/common';

import type { Job } from 'bullmq';

import { RedisService } from '../core/redis/redis.module';
import { JobStatus, ScheduledJobsRepository, ScheduledJobsService } from '../jobs/jobs.module';
import { MESSAGING_PROVIDER, type MessagingProvider, type ProviderContext, ProviderType } from '../providers/providers.module';
import { QueueNames, QueueRegistryService } from '../queues/queue.module';
import { ConversationsRepository } from '../modules/conversations/conversations.module';
import { BaseWorker } from './base.worker';

interface FollowupJobData {
  tenantId: string;
  conversationId: string;
  providerId: string;
  to: string;
  content: string;
  scheduledJobId: string;
}

@Injectable()
export class FollowupWorker extends BaseWorker<FollowupJobData> {
  constructor(
    redisService: RedisService,
    queueRegistryService: QueueRegistryService,
    private readonly conversationsRepository: ConversationsRepository,
    private readonly scheduledJobsRepository: ScheduledJobsRepository,
    private readonly scheduledJobsService: ScheduledJobsService,
    @Inject(MESSAGING_PROVIDER) private readonly messagingProvider: MessagingProvider,
  ) {
    super(QueueNames.Followups, redisService, queueRegistryService);
  }

  protected async process(job: Job<FollowupJobData>): Promise<void> {
    const scheduledJob = await this.scheduledJobsRepository.findById(job.data.tenantId, job.data.scheduledJobId);
    if (!scheduledJob || scheduledJob.status === JobStatus.Cancelled) {
      return;
    }

    const conversation = await this.conversationsRepository.findById(job.data.tenantId, job.data.conversationId);
    if (!conversation || conversation.mode !== 'BOT') {
      await this.scheduledJobsService.markCancelled(job.data.tenantId, job.data.scheduledJobId);
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

    await this.messagingProvider.sendText({
      provider,
      to: job.data.to,
      text: job.data.content,
      conversationId: job.data.conversationId,
    });

    await this.scheduledJobsService.markCompleted(job.data.tenantId, job.data.scheduledJobId);
  }
}