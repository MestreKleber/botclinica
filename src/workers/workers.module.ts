import { Module } from '@nestjs/common';

import { BotEngineModule } from '../bot-engine/bot-engine.module';
import { JobsModule } from '../jobs/jobs.module';
import { PrismaModule } from '../prisma/prisma.module';
import { QueueModule } from '../queues/queue.module';
import { AiModule } from '../modules/ai/ai.module';
import { ConversationsModule } from '../modules/conversations/conversations.module';
import { MessagesModule } from '../modules/messages/messages.module';
import { IncomingMessageWorker } from './incoming-message.worker';
import { OutgoingMessageWorker } from './outgoing-message.worker';
import { FollowupWorker } from './followup.worker';
import { ProviderEventsWorker } from './provider-events.worker';
import { AiProcessingWorker } from './ai-processing.worker';

@Module({
  imports: [PrismaModule, QueueModule, JobsModule, ConversationsModule, MessagesModule, BotEngineModule, AiModule],
  providers: [IncomingMessageWorker, OutgoingMessageWorker, FollowupWorker, ProviderEventsWorker, AiProcessingWorker],
})
export class WorkersModule {}