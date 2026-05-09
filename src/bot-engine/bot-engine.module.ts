import { Global, Injectable, Module } from '@nestjs/common';

export enum ConversationMode {
  Bot = 'BOT',
  Human = 'HUMAN',
  Paused = 'PAUSED',
}

export enum ConversationState {
  Open = 'OPEN',
  Closed = 'CLOSED',
  Archived = 'ARCHIVED',
}

@Injectable()
export class ConversationStateMachineService {
  canSendAutomation(mode: ConversationMode): boolean {
    return mode === ConversationMode.Bot;
  }

  canSendOutgoingMessage(mode: ConversationMode): boolean {
    return mode !== ConversationMode.Human && mode !== ConversationMode.Paused;
  }

  shouldTakeoverAutomatically(fromMe: boolean): boolean {
    return fromMe;
  }

  applyHumanTakeover(): { mode: ConversationMode; state: ConversationState } {
    return { mode: ConversationMode.Human, state: ConversationState.Open };
  }
}

@Global()
@Module({
  providers: [ConversationStateMachineService],
  exports: [ConversationStateMachineService],
})
export class BotEngineModule {}