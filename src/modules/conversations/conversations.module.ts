import { Body, Controller, Get, Injectable, Module, Param, Patch, Post, UseGuards } from '@nestjs/common';

import { IsEnum, IsOptional, IsString } from 'class-validator';

import { BotEngineModule, ConversationMode, ConversationState, ConversationStateMachineService } from '../../bot-engine/bot-engine.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/auth.module';
import { TenantId } from '../../core/tenant/tenant.module';

export class CreateConversationDto {
  @IsString()
  contactId!: string;

  @IsString()
  providerId!: string;

  @IsOptional()
  @IsEnum(ConversationMode)
  mode?: ConversationMode;
}

export class UpdateConversationModeDto {
  @IsEnum(ConversationMode)
  mode!: ConversationMode;
}

@Injectable()
export class ConversationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(tenantId: string, data: Record<string, unknown>): Promise<any> {
    return this.prisma.conversation.create({ data: { ...data, tenantId } as never });
  }

  findById(tenantId: string, id: string): Promise<any> {
    return this.prisma.conversation.findFirst({ where: { tenantId, id } });
  }

  findByContactAndProvider(tenantId: string, contactId: string, providerId: string): Promise<any> {
    return this.prisma.conversation.findFirst({ where: { tenantId, contactId, providerId } });
  }

  listByTenant(tenantId: string): Promise<any> {
    return this.prisma.conversation.findMany({ where: { tenantId }, orderBy: { updatedAt: 'desc' } });
  }

  updateMode(tenantId: string, id: string, mode: ConversationMode): Promise<any> {
    return this.prisma.conversation.update({ where: { id, tenantId } as never, data: { mode } as never });
  }

  markHumanTakeover(tenantId: string, id: string, takeoverAt: Date): Promise<any> {
    return this.prisma.conversation.update({ where: { id, tenantId } as never, data: { mode: ConversationMode.Human, takeoverAt } as never });
  }
}

@Injectable()
export class ConversationsService {
  constructor(
    private readonly conversationsRepository: ConversationsRepository,
    private readonly stateMachine: ConversationStateMachineService,
  ) {}

  create(tenantId: string, input: CreateConversationDto): Promise<any> {
    return this.conversationsRepository.create(tenantId, {
      contact: { connect: { id: input.contactId } },
      provider: { connect: { id: input.providerId } },
      mode: input.mode ?? ConversationMode.Bot,
      state: ConversationState.Open,
    });
  }

  list(tenantId: string): Promise<any> {
    return this.conversationsRepository.listByTenant(tenantId);
  }

  findById(tenantId: string, id: string): Promise<any> {
    return this.conversationsRepository.findById(tenantId, id);
  }

  updateMode(tenantId: string, id: string, input: UpdateConversationModeDto): Promise<any> {
    return this.conversationsRepository.updateMode(tenantId, id, input.mode);
  }

  markHumanTakeover(tenantId: string, id: string): Promise<any> {
    return this.conversationsRepository.markHumanTakeover(tenantId, id, new Date());
  }

  canSendOutgoingMessage(mode: ConversationMode): boolean {
    return this.stateMachine.canSendOutgoingMessage(mode);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Post()
  create(@TenantId() tenantId: string, @Body() body: CreateConversationDto) {
    return this.conversationsService.create(tenantId, body);
  }

  @Get()
  list(@TenantId() tenantId: string) {
    return this.conversationsService.list(tenantId);
  }

  @Get(':id')
  findById(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.conversationsService.findById(tenantId, id);
  }

  @Patch(':id/mode')
  updateMode(@TenantId() tenantId: string, @Param('id') id: string, @Body() body: UpdateConversationModeDto) {
    return this.conversationsService.updateMode(tenantId, id, body);
  }
}

@Module({
  imports: [PrismaModule, BotEngineModule],
  controllers: [ConversationsController],
  providers: [ConversationsRepository, ConversationsService],
  exports: [ConversationsRepository, ConversationsService],
})
export class ConversationsModule {}