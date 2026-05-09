import { Injectable, Module } from '@nestjs/common';

import { IsBoolean, IsObject, IsString } from 'class-validator';

import { JobsModule, JobTypes, ScheduledJobsService } from '../../jobs/jobs.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { QueueNames, QueueRegistryService } from '../../queues/queue.module';

export enum AutomationTrigger {
  IncomingMessage = 'INCOMING_MESSAGE',
  FollowUp = 'FOLLOW_UP',
  HumanTakeover = 'HUMAN_TAKEOVER',
  NoReply = 'NO_REPLY',
}

export class CreateAutomationDto {
  @IsString()
  name!: string;

  @IsString()
  trigger!: AutomationTrigger;

  @IsBoolean()
  enabled!: boolean;

  @IsObject()
  config!: Record<string, unknown>;
}

@Injectable()
export class AutomationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(tenantId: string, data: Record<string, unknown>): Promise<any> {
    return this.prisma.automation.create({ data: { ...data, tenantId } as never });
  }

  listByTenant(tenantId: string): Promise<any> {
    return this.prisma.automation.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
  }

  listEnabledByTrigger(tenantId: string, trigger: AutomationTrigger): Promise<any> {
    return this.prisma.automation.findMany({ where: { tenantId, trigger, enabled: true } });
  }
}

@Injectable()
export class AutomationsService {
  constructor(
    private readonly automationsRepository: AutomationsRepository,
    private readonly queueRegistryService: QueueRegistryService,
    private readonly scheduledJobsService: ScheduledJobsService,
  ) {}

  create(tenantId: string, input: CreateAutomationDto): Promise<any> {
    return this.automationsRepository.create(tenantId, {
      name: input.name,
      trigger: input.trigger,
      enabled: input.enabled,
      config: input.config,
    });
  }

  async scheduleFollowup(tenantId: string, payload: { conversationId: string; providerId: string; to: string; content: string; delaySeconds: number }): Promise<any> {
    const runAt = new Date(Date.now() + payload.delaySeconds * 1000);
    const scheduledJob = await this.scheduledJobsService.create(tenantId, {
      jobType: JobTypes.Followup,
      queueName: QueueNames.Followups,
      runAt,
      payload: { tenantId, ...payload },
    });

    const record = scheduledJob as { id: string };
    await this.queueRegistryService.add(
      QueueNames.Followups,
      'automation.followup',
      { tenantId, ...payload, scheduledJobId: record.id },
      { delay: Math.max(0, payload.delaySeconds * 1000), jobId: record.id },
    );

    return scheduledJob;
  }
}

@Module({
  imports: [PrismaModule, JobsModule],
  providers: [AutomationsRepository, AutomationsService],
  exports: [AutomationsRepository, AutomationsService],
})
export class AutomationsModule {}