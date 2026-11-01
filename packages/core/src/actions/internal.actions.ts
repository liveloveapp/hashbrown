import type { BrowserRecoveryCheckpoint } from '../reducers/resume-checkpoint';
import type { PendingInterruptBatch } from '../models/interrupt';
import type { ToolMessage } from '@ag-ui/core';
import { createActionGroup, emptyProps, props } from '../utils/micro-ngrx';
import { Chat } from '../models';

export default createActionGroup('internal', {
  start: emptyProps(),
  interruptsPublished: props<{
    generationId: string;
    attemptId: string;
    batch: PendingInterruptBatch;
  }>(),
  browserRecoveryAcknowledged: props<{
    claimId: string;
    checkpoint: BrowserRecoveryCheckpoint;
    canonicalMessages: BrowserRecoveryCheckpoint['canonicalMessages'];
    toolsByName: BrowserRecoveryCheckpoint['toolsByName'];
    responseSchema: BrowserRecoveryCheckpoint['responseSchema'];
    localProjection?: never;
  }>(),
  browserRecoveryClaimReleased: props<{ claimId: string }>(),
  browserRecoverySettled: props<{
    claimId: string;
    outcome: 'success' | 'failed' | 'cancelled' | 'retired';
  }>(),
  resumeSettlementStarted: emptyProps(),
  resumeAcknowledged: props<{ generationId: string; claimId: string }>(),
  resumeSettled: props<{
    generationId: string;
    outcome: 'success' | 'failed' | 'cancelled' | 'retired';
  }>(),
  interruptThreadRetired: emptyProps(),
  threadUpdateStarted: emptyProps(),
  logicalGenerationStarted: props<{ generationId: string }>(),
  generationAttemptClaimed: props<{
    generationId: string;
    attemptId: string;
  }>(),
  generationAttemptReleased: props<{
    generationId: string;
    attemptId: string;
  }>(),
  generationAttemptStarted: emptyProps(),
  generationAttemptRolledBack: emptyProps(),
  generationAttemptFailed: props<{
    generationId: string;
    attemptId: string;
    toolsByName: Readonly<Record<string, Chat.Internal.Tool>>;
  }>(),
  toolTurnReserved: props<{
    generationId: string;
    toolTurnId: string;
    toolCalls: Chat.Internal.ToolCall[];
  }>(),
  toolTurnStarted: props<{
    generationId: string;
    toolTurnId: string;
  }>(),
  generationCancelled: props<{
    generationId: string;
    markerId: string;
    reason: 'stopped' | 'superseded';
    beforeMessageId?: string;
  }>(),
  logicalGenerationSettled: props<{ generationId: string }>(),
  generationSilentlyRetired: emptyProps(),
  toolTurnSettled: props<{
    generationId: string;
    toolTurnId: string;
    toolCalls: readonly Chat.Internal.ToolCall[];
    toolMessages: readonly Chat.Api.ToolMessage[];
    canonicalMessages: readonly Readonly<ToolMessage>[];
    continuation: 'continue' | 'stop';
  }>(),
  runToolCallsError: props<Error>(),
  skippedToolCalls: emptyProps(),
});
