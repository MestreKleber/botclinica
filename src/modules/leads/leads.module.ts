import { Body, Controller, Get, Injectable, Module, Post, UseGuards } from '@nestjs/common';

import { IsInt, IsOptional, IsString, Min } from 'class-validator';

import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/auth.module';
import { TenantId } from '../../core/tenant/tenant.module';

export enum LeadStatus {
  New = 'NEW',
  Qualified = 'QUALIFIED',
  Converted = 'CONVERTED',
  Disqualified = 'DISQUALIFIED',
}

export class CreateLeadDto {
  @IsString()
  contactId!: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  status?: LeadStatus;

  @IsOptional()
  @IsInt()
  @Min(0)
  score?: number;
}

@Injectable()
export class LeadsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(tenantId: string, data: Record<string, unknown>): Promise<any> {
    return this.prisma.lead.create({ data: { ...data, tenantId } as never });
  }

  listByTenant(tenantId: string): Promise<any> {
    return this.prisma.lead.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
  }
}

@Injectable()
export class LeadsService {
  constructor(private readonly leadsRepository: LeadsRepository) {}

  create(tenantId: string, input: CreateLeadDto): Promise<any> {
    return this.leadsRepository.create(tenantId, {
      contact: { connect: { id: input.contactId } },
      source: input.source,
      status: input.status ?? LeadStatus.New,
      score: input.score ?? 0,
    });
  }

  list(tenantId: string): Promise<any> {
    return this.leadsRepository.listByTenant(tenantId);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Post()
  create(@TenantId() tenantId: string, @Body() body: CreateLeadDto) {
    return this.leadsService.create(tenantId, body);
  }

  @Get()
  list(@TenantId() tenantId: string) {
    return this.leadsService.list(tenantId);
  }
}

@Module({
  imports: [PrismaModule],
  controllers: [LeadsController],
  providers: [LeadsRepository, LeadsService],
  exports: [LeadsRepository, LeadsService],
})
export class LeadsModule {}