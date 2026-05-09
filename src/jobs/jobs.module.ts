import { Global, Injectable, Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';

export enum JobTypes {
  OutgoingMessage = 'OUTGOING_MESSAGE',
  Followup = 'FOLLOWUP',
  IncomingMessage = 'INCOMING_MESSAGE',
  Automation = 'AUTOMATION',
  ProviderEvent = 'PROVIDER_EVENT',
  AiProcessing = 'AI_PROCESSING',
}

export enum JobStatus {
  Pending = 'PENDING',
  Running = 'RUNNING',
  Completed = 'COMPLETED',
  Failed = 'FAILED',
  Cancelled = 'CANCELLED',
  DeadLetter = 'DEAD_LETTER',
}

@Injectable()
export class ScheduledJobsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(tenantId: string, data: Record<string, unknown>): Promise<any> {
    return this.prisma.scheduledJob.create({ data: { ...data, tenantId } as never });
  }

  findById(tenantId: string, id: string): Promise<any> {
    return this.prisma.scheduledJob.findFirst({ where: { id, tenantId } });
  }

  findByJobId(tenantId: string, jobId: string): Promise<any> {
    return this.prisma.scheduledJob.findFirst({ where: { tenantId, jobId } });
  }

  updateStatus(tenantId: string, id: string, status: JobStatus, patch: Record<string, unknown> = {}): Promise<any> {
    return this.prisma.scheduledJob.update({ where: { id, tenantId } as never, data: { status, ...patch } as never });
  }
}

@Injectable()
export class ScheduledJobsService {
  constructor(private readonly scheduledJobsRepository: ScheduledJobsRepository) {}

  create(tenantId: string, payload: { jobType: JobTypes; queueName: string; runAt: Date; payload: unknown; jobId?: string }): Promise<any> {
    return this.scheduledJobsRepository.create(tenantId, {
      jobType: payload.jobType,
      queueName: payload.queueName,
      runAt: payload.runAt,
      payload: payload.payload,
      jobId: payload.jobId,
      status: JobStatus.Pending,
    });
  }

  markCancelled(tenantId: string, id: string): Promise<any> {
    return this.scheduledJobsRepository.updateStatus(tenantId, id, JobStatus.Cancelled, { cancelledAt: new Date() });
  }

  markRunning(tenantId: string, id: string): Promise<any> {
    return this.scheduledJobsRepository.updateStatus(tenantId, id, JobStatus.Running, { lockedAt: new Date() });
  }

  markCompleted(tenantId: string, id: string): Promise<any> {
    return this.scheduledJobsRepository.updateStatus(tenantId, id, JobStatus.Completed, { processedAt: new Date() });
  }

  markFailed(tenantId: string, id: string, reason: string): Promise<any> {
    return this.scheduledJobsRepository.updateStatus(tenantId, id, JobStatus.Failed, { failureReason: reason, processedAt: new Date() });
  }
}

@Global()
@Module({
  imports: [PrismaModule],
  providers: [ScheduledJobsRepository, ScheduledJobsService],
  exports: [ScheduledJobsRepository, ScheduledJobsService],
})
export class JobsModule {}