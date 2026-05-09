import { Global, Injectable, Module } from '@nestjs/common';

import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';

export enum UserRole {
  Owner = 'OWNER',
  Admin = 'ADMIN',
  Agent = 'AGENT',
  Bot = 'BOT',
}

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(tenantId: string, data: Record<string, unknown>): Promise<any> {
    return this.prisma.user.create({ data: { ...data, tenantId } as never });
  }

  findById(tenantId: string, id: string): Promise<any> {
    return this.prisma.user.findFirst({ where: { id, tenantId } });
  }

  findByEmail(tenantId: string, email: string): Promise<any> {
    return this.prisma.user.findFirst({ where: { tenantId, email } });
  }

  listByTenant(tenantId: string): Promise<any> {
    return this.prisma.user.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
  }
}

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  findByEmail(tenantId: string, email: string): Promise<any> {
    return this.usersRepository.findByEmail(tenantId, email);
  }

  async createUser(tenantId: string, input: { email: string; password: string; role: UserRole; name?: string }): Promise<any> {
    const bcrypt = await import('bcrypt');
    const passwordHash = await bcrypt.default.hash(input.password, 12);

    return this.usersRepository.create(tenantId, {
      email: input.email,
      passwordHash,
      role: input.role,
      name: input.name,
      isActive: true,
    });
  }
}

@Global()
@Module({
  imports: [PrismaModule],
  providers: [UsersRepository, UsersService],
  exports: [UsersRepository, UsersService],
})
export class UsersModule {}