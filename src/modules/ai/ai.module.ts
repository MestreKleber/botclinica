import { Module } from '@nestjs/common';

import { CoreConfigModule } from '../../core/config/configuration.module';
import { QueueModule } from '../../queues/queue.module';
import { MessagesModule } from '../messages/messages.module';
import { OpenAIProvider } from '../../providers/openai/openai.provider';
import { AiService } from './ai.service';

@Module({
  imports: [CoreConfigModule, QueueModule, MessagesModule],
  providers: [AiService, OpenAIProvider],
  exports: [AiService, OpenAIProvider],
})
export class AiModule {}
