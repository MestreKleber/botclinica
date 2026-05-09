import { Injectable, Module } from '@nestjs/common';

import { IsObject, IsOptional, IsString } from 'class-validator';

import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';

export class CreateContactDto {
  @IsString()
  phone!: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  externalId?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

@Injectable()
export class ContactsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(tenantId: string, data: Record<string, unknown>): Promise<any> {
    return this.prisma.contact.create({ data: { ...data, tenantId } as never });
  }

  findById(tenantId: string, id: string): Promise<any> {
    return this.prisma.contact.findFirst({ where: { tenantId, id } });
  }

  findByPhone(tenantId: string, phone: string): Promise<any> {
    return this.prisma.contact.findFirst({ where: { tenantId, phone } });
  }

  listByTenant(tenantId: string): Promise<any> {
    return this.prisma.contact.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
  }
}

@Injectable()
export class ContactsService {
  constructor(private readonly contactsRepository: ContactsRepository) {}

  create(tenantId: string, input: CreateContactDto): Promise<any> {
    return this.contactsRepository.create(tenantId, {
      phone: input.phone,
      name: input.name,
      externalId: input.externalId,
      metadata: input.metadata ?? {},
    });
  }

  list(tenantId: string): Promise<any> {
    return this.contactsRepository.listByTenant(tenantId);
  }
}

@Module({
  imports: [PrismaModule],
  providers: [ContactsRepository, ContactsService],
  exports: [ContactsRepository, ContactsService],
})
export class ContactsModule {}