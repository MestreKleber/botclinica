import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';

import { CoreConfigModule } from './core/config/configuration.module';
import { CoreLoggerModule } from './core/logger/logger.module';
import { TenantMiddleware, TenantModule } from './core/tenant/tenant.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './core/redis/redis.module';
import { QueueModule } from './queues/queue.module';
import { BotEngineModule } from './bot-engine/bot-engine.module';
import { JobsModule } from './jobs/jobs.module';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { ProvidersModule } from './providers/providers.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { MessagesModule } from './modules/messages/messages.module';
import { LeadsModule } from './modules/leads/leads.module';
import { AutomationsModule } from './modules/automations/automations.module';
import { WorkersModule } from './workers/workers.module';

@Module({
  imports: [
    CoreConfigModule,
    CoreLoggerModule,
    PrismaModule,
    RedisModule,
    QueueModule,
    TenantModule,
    BotEngineModule,
    JobsModule,
    UsersModule,
    AuthModule,
    TenantsModule,
    ContactsModule,
    ProvidersModule,
    ConversationsModule,
    MessagesModule,
    LeadsModule,
    AutomationsModule,
    WorkersModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}