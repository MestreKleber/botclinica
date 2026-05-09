import { Body, Controller, Get, Injectable, Module, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';

import { IsBoolean, IsOptional, IsString } from 'class-validator';

import { BotEngineModule, ConversationMode, ConversationStateMachineService } from '../../bot-engine/bot-engine.module';
import { JobsModule, JobTypes, ScheduledJobsRepository, ScheduledJobsService } from '../../jobs/jobs.module';
import { QueueModule, QueueNames, QueueRegistryService } from '../../queues/queue.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/auth.module';
import { TenantId } from '../../core/tenant/tenant.module';
import { ConversationsModule, ConversationsRepository } from '../conversations/conversations.module';

export enum MessageDirection {
  Inbound = 'INBOUND',
  Outbound = 'OUTBOUND',
}

export enum MessageStatus {
  Pending = 'PENDING',
  Scheduled = 'SCHEDULED',
  Sent = 'SENT',
  Delivered = 'DELIVERED',
  Read = 'READ',
  Failed = 'FAILED',
  Cancelled = 'CANCELLED',
}

export enum MessageKind {
  Text = 'TEXT',
  Media = 'MEDIA',
  Template = 'TEMPLATE',
  System = 'SYSTEM',
}

export class SendMessageDto {
  @IsString()
  conversationId!: string;

  @IsString()
  providerId!: string;

  @IsString()
  to!: string;

  @IsString()
  content!: string;

  @IsOptional()
  @IsString()
  mediaUrl?: string;

  @IsOptional()
  @IsString()
  templateName?: string;

  @IsOptional()
  @IsBoolean()
  fromBot?: boolean;
}

export class RecordIncomingMessageDto {
  @IsString()
  conversationId!: string;

  @IsString()
  providerId!: string;

  @IsString()
  content!: string;

  @IsOptional()
  @IsString()
  externalMessageId?: string;

  @IsOptional()
  @IsBoolean()
  fromMe?: boolean;
}

@Injectable()
export class MessagesRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(tenantId: string, data: Record<string, unknown>): Promise<any> {
    return this.prisma.message.create({ data: { ...data, tenantId } as never });
  }

  findById(tenantId: string, id: string): Promise<any> {
    return this.prisma.message.findFirst({ where: { tenantId, id } });
  }

  listByConversation(tenantId: string, conversationId: string): Promise<any> {
    return this.prisma.message.findMany({ where: { tenantId, conversationId }, orderBy: { createdAt: 'asc' } });
  }

  updateStatus(tenantId: string, id: string, status: MessageStatus, patch: Record<string, unknown> = {}): Promise<any> {
    return this.prisma.message.update({ where: { id, tenantId } as never, data: { status, ...patch } as never });
  }
}

@Injectable()
export class MessagesService {
  constructor(
    private readonly messagesRepository: MessagesRepository,
    private readonly conversationsRepository: ConversationsRepository,
    private readonly queueRegistryService: QueueRegistryService,
    private readonly scheduledJobsService: ScheduledJobsService,
    private readonly scheduledJobsRepository: ScheduledJobsRepository,
    private readonly stateMachine: ConversationStateMachineService,
  ) {}

  async sendOutgoing(tenantId: string, input: SendMessageDto, delaySeconds = 0): Promise<any> {
    const conversation = await this.conversationsRepository.findById(tenantId, input.conversationId);
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    if (!this.stateMachine.canSendOutgoingMessage(conversation.mode as ConversationMode)) {
      throw new Error('Conversation is not accepting bot messages');
    }

    const message = await this.messagesRepository.create(tenantId, {
      conversation: { connect: { id: input.conversationId } },
      provider: { connect: { id: input.providerId } },
      direction: MessageDirection.Outbound,
      status: delaySeconds > 0 ? MessageStatus.Scheduled : MessageStatus.Pending,
      kind: input.templateName ? MessageKind.Template : input.mediaUrl ? MessageKind.Media : MessageKind.Text,
      content: input.content,
      mediaUrl: input.mediaUrl,
      templateName: input.templateName,
      to: input.to,
      fromMe: true,
    });

    const runAt = new Date(Date.now() + delaySeconds * 1000);
    const scheduledJob = await this.scheduledJobsService.create(tenantId, {
      jobType: JobTypes.OutgoingMessage,
      queueName: QueueNames.OutgoingMessages,
      runAt,
      payload: {
        tenantId,
        messageId: message.id,
        conversationId: conversation.id,
        providerId: input.providerId,
        to: input.to,
      },
    });

    const scheduledJobRecord = scheduledJob as { id: string };
    await this.messagesRepository.updateStatus(tenantId, message.id, MessageStatus.Scheduled, {
      scheduledJobId: scheduledJobRecord.id,
    });

    await this.queueRegistryService.add(
      QueueNames.OutgoingMessages,
      'message.send',
      {
        tenantId,
        messageId: message.id,
        conversationId: conversation.id,
        providerId: input.providerId,
        to: input.to,
        scheduledJobId: scheduledJobRecord.id,
      },
      { delay: Math.max(0, delaySeconds * 1000), jobId: scheduledJobRecord.id },
    );

    return { messageId: message.id, scheduledJobId: scheduledJobRecord.id };
  }

  async recordIncoming(tenantId: string, input: RecordIncomingMessageDto): Promise<any> {
    const conversation = await this.conversationsRepository.findById(tenantId, input.conversationId);
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    if (input.fromMe ?? false) {
      await this.conversationsRepository.markHumanTakeover(tenantId, input.conversationId, new Date());
    }

    const message = await this.messagesRepository.create(tenantId, {
      conversation: { connect: { id: input.conversationId } },
      provider: { connect: { id: input.providerId } },
      direction: MessageDirection.Inbound,
      status: MessageStatus.Sent,
      kind: MessageKind.Text,
      content: input.content,
      externalMessageId: input.externalMessageId,
      fromMe: input.fromMe ?? false,
      to: conversation.contactId,
    });

    if (!(input.fromMe ?? false) && this.stateMachine.canSendAutomation(conversation.mode as ConversationMode)) {
      await this.queueRegistryService.add(QueueNames.Automations, 'automation.evaluate', {
        tenantId,
        conversationId: conversation.id,
        messageId: message.id,
      });
    }

    return message.id;
  }

  async cancelScheduledMessage(tenantId: string, messageId: string): Promise<any> {
    const message = await this.messagesRepository.findById(tenantId, messageId);
    if (!message || !message.scheduledJobId) {
      throw new Error('Scheduled message not found');
    }

    const scheduledJob = await this.scheduledJobsRepository.findByJobId(tenantId, message.scheduledJobId);
    if (scheduledJob) {
      await this.queueRegistryService.removeJob(QueueNames.OutgoingMessages, message.scheduledJobId);
      await this.scheduledJobsService.markCancelled(tenantId, scheduledJob.id);
    }

    return this.messagesRepository.updateStatus(tenantId, messageId, MessageStatus.Cancelled);
  }

  listByConversation(tenantId: string, conversationId: string): Promise<any> {
    return this.messagesRepository.listByConversation(tenantId, conversationId);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Post('outgoing')
  send(@TenantId() tenantId: string, @Body() body: SendMessageDto, @Query('delaySeconds') delaySeconds?: string) {
    return this.messagesService.sendOutgoing(tenantId, body, Number(delaySeconds ?? 0));
  }

  @Post('incoming')
  recordIncoming(@TenantId() tenantId: string, @Body() body: RecordIncomingMessageDto) {
    return this.messagesService.recordIncoming(tenantId, body);
  }

  @Patch(':id/cancel')
  cancel(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.messagesService.cancelScheduledMessage(tenantId, id);
  }

  @Get(':conversationId')
  list(@TenantId() tenantId: string, @Param('conversationId') conversationId: string) {
    return this.messagesService.listByConversation(tenantId, conversationId);
  }
}

@Module({
  imports: [PrismaModule, JobsModule, QueueModule, ConversationsModule, BotEngineModule],
  controllers: [MessagesController],
  providers: [MessagesRepository, MessagesService],
  exports: [MessagesRepository, MessagesService],
})
export class MessagesModule {}