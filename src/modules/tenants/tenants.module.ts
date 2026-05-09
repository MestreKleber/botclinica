import { Body, Controller, Get, Injectable, Module, Param, Post, UseGuards } from '@nestjs/common';

import { IsOptional, IsString } from 'class-validator';

import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/auth.module';

export class CreateTenantDto {
  @IsString()
  name!: string;

  @IsString()
  slug!: string;

  @IsOptional()
  @IsString()
  timezone?: string;
}

@Injectable()
export class TenantsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Record<string, unknown>): Promise<any> {
    return this.prisma.tenant.create({ data: data as never });
  }

  findById(id: string): Promise<any> {
    return this.prisma.tenant.findUnique({ where: { id } });
  }

  list(): Promise<any> {
    return this.prisma.tenant.findMany({ orderBy: { createdAt: 'desc' } });
  }
}

@Injectable()
export class TenantsService {
  constructor(private readonly tenantsRepository: TenantsRepository) {}

  create(input: CreateTenantDto): Promise<any> {
    return this.tenantsRepository.create({
      name: input.name,
      slug: input.slug,
      timezone: input.timezone,
    });
  }

  list(): Promise<any> {
    return this.tenantsRepository.list();
  }

  findById(id: string): Promise<any> {
    return this.tenantsRepository.findById(id);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post()
  create(@Body() body: CreateTenantDto) {
    return this.tenantsService.create(body);
  }

  @Get()
  list() {
    return this.tenantsService.list();
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.tenantsService.findById(id);
  }
}

@Module({
  imports: [PrismaModule],
  controllers: [TenantsController],
  providers: [TenantsRepository, TenantsService],
  exports: [TenantsRepository, TenantsService],
})
export class TenantsModule {}