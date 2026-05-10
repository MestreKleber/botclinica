import { Injectable } from '@nestjs/common';

import { QueueNames, QueueRegistryService } from '../../queues/queue.module';

export interface AiJobPayload {
  tenantId: string;
  conversationId: string;
  providerId: string;
  to: string;
  prompt: string;
  options?: Record<string, unknown>;
}

@Injectable()
export class AiService {
  constructor(private readonly queueRegistry: QueueRegistryService) {}

  async enqueueCompletion(payload: AiJobPayload): Promise<string> {
    const jobId = await this.queueRegistry.add(QueueNames.AiProcessing, 'generate', payload, {
      removeOnComplete: 1000,
      attempts: 5,
      backoff: { type: 'exponential', delay: 1000 },
    });

    return jobId;
  }
}
