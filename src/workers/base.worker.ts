import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { Worker, type Job, type WorkerOptions } from 'bullmq';

import { RedisService } from '../core/redis/redis.module';
import { QueueNames, QueueRegistryService } from '../queues/queue.module';

export abstract class BaseWorker<TData = Record<string, unknown>> implements OnModuleInit, OnModuleDestroy {
  private worker?: Worker<TData>;

  protected constructor(
    private readonly queueName: QueueNames,
    protected readonly redisService: RedisService,
    protected readonly queueRegistryService: QueueRegistryService,
  ) {}

  onModuleInit(): void {
    const workerOptions: WorkerOptions = {
      connection: this.redisService.connection,
      concurrency: 5,
    };

    this.worker = new Worker<TData>(this.queueName, (job) => this.process(job), workerOptions);
    this.worker.on('failed', (job, error) => {
      if (job) {
        void this.queueRegistryService.add(QueueNames.DeadLetter, `${this.queueName}.failed`, {
          queueName: this.queueName,
          jobId: job.id,
          payload: job.data,
          reason: error.message,
        });
      }
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }

  protected abstract process(job: Job<TData>): Promise<unknown>;
}