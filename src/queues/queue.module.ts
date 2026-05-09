import { Global, Injectable, Module, OnModuleDestroy } from '@nestjs/common';

import { Queue, type JobsOptions } from 'bullmq';

import { RedisService } from '../core/redis/redis.module';

export enum QueueNames {
  IncomingMessages = 'incoming-messages',
  OutgoingMessages = 'outgoing-messages',
  Followups = 'followups',
  Automations = 'automations',
  ProviderEvents = 'provider-events',
  AiProcessing = 'ai-processing',
  DeadLetter = 'dead-letter',
}

@Injectable()
export class QueueRegistryService implements OnModuleDestroy {
  private readonly queues = new Map<QueueNames, Queue>();

  constructor(private readonly redisService: RedisService) {}

  getQueue(name: QueueNames): Queue {
    const existingQueue = this.queues.get(name);
    if (existingQueue) {
      return existingQueue;
    }

    const queue = new Queue(name, {
      connection: this.redisService.connection,
      defaultJobOptions: {
        attempts: 5,
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    });

    this.queues.set(name, queue);
    return queue;
  }

  async add<TData>(queueName: QueueNames, jobName: string, data: TData, options?: JobsOptions): Promise<string> {
    const job = await this.getQueue(queueName).add(jobName, data, options);
    return job.id ?? '';
  }

  async removeJob(queueName: QueueNames, jobId: string): Promise<void> {
    const job = await this.getQueue(queueName).getJob(jobId);
    if (job) {
      await job.remove();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
  }
}

@Global()
@Module({
  providers: [QueueRegistryService],
  exports: [QueueRegistryService],
})
export class QueueModule {}