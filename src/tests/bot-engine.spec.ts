import assert from 'node:assert/strict';
import test from 'node:test';

import { ConversationMode, ConversationStateMachineService } from '../bot-engine/bot-engine.module';

test('conversation state machine blocks human mode automations', () => {
  const stateMachine = new ConversationStateMachineService();
  assert.equal(stateMachine.canSendAutomation(ConversationMode.Human), false);
  assert.equal(stateMachine.canSendOutgoingMessage(ConversationMode.Bot), true);
});