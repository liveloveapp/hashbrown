import type { FinishReason } from '@hashbrownai/core';

/** A simulated, application-owned light. */
export interface Light {
  readonly id: string;
  readonly name: string;
  readonly brightness: number;
}
/** A revisioned snapshot of the simulated lights. */
export interface LightState {
  readonly revision: number;
  readonly lights: readonly Light[];
}
/** Model-proposed display values, never authorization. */
export interface LightProposalProps {
  readonly lightId: string;
  readonly brightness: number;
}
/** Application context captured once when a proposal mounts. */
export interface ProposalOrigin {
  readonly turn: number;
  readonly revision: number;
}
/** Current application and runtime conditions for a user-operated Apply. */
export interface LightAuthorization {
  readonly turn: number;
  readonly cancelled: boolean;
  readonly settled: boolean;
  readonly error: boolean;
  readonly interrupted: boolean;
  readonly finishReason: FinishReason | undefined;
}
/** Creates a fresh simulated Desk light at 80 percent. */
export function initialLightState(): LightState {
  return {
    revision: 0,
    lights: [{ id: 'desk', name: 'Desk light', brightness: 80 }],
  };
}
/** Returns an independent snapshot without changing application state. */
export function readLights(state: LightState): LightState {
  return {
    revision: state.revision,
    lights: state.lights.map((light) => ({ ...light })),
  };
}
/** Checks the current run and validates proposal values at the action boundary. */
export function canApplyLightProposal(
  state: LightState,
  origin: ProposalOrigin,
  proposal: LightProposalProps,
  authorization: LightAuthorization,
  used: boolean,
): boolean {
  return (
    !used &&
    !authorization.cancelled &&
    authorization.settled &&
    !authorization.error &&
    !authorization.interrupted &&
    authorization.finishReason === 'stop' &&
    origin.turn === authorization.turn &&
    origin.revision === state.revision &&
    state.lights.some((light) => light.id === proposal.lightId) &&
    Number.isInteger(proposal.brightness) &&
    proposal.brightness >= 0 &&
    proposal.brightness <= 100
  );
}
/** Applies once to the current revision, or returns the unchanged state. */
export function applyLightProposal(
  state: LightState,
  origin: ProposalOrigin,
  proposal: LightProposalProps,
  authorization: LightAuthorization,
  used: boolean,
): LightState {
  if (!canApplyLightProposal(state, origin, proposal, authorization, used))
    return state;
  return {
    revision: state.revision + 1,
    lights: state.lights.map((light) =>
      light.id === proposal.lightId
        ? { ...light, brightness: proposal.brightness }
        : light,
    ),
  };
}
/** Binds assistant history to the application origin of its preceding user message. */
export function lightMessageOrigins(
  messages: readonly { readonly id?: string; readonly role: string }[],
  requests: Readonly<Record<string, ProposalOrigin>>,
): Readonly<Partial<Record<string, ProposalOrigin>>> {
  let origin: ProposalOrigin | undefined;
  const result: Record<string, ProposalOrigin> = {};
  for (const message of messages) {
    if (message.role === 'user')
      origin = message.id ? requests[message.id] : undefined;
    if (message.role === 'assistant' && message.id && origin)
      result[message.id] = origin;
  }
  return result;
}

/** Instructions shared by the checked clients; the read tool never changes a light. */
export const lightChatSystem = `You help with one simulated Desk light. Always call readLights before answering each user message. For a brightness change, render one LightProposal with the known light id and requested brightness; the user must apply it. For a question about current brightness, render one read-only LightReading with the id and brightness returned by readLights. Never claim that a proposal has already changed a light.`;

/** Explains runtime outcomes without treating partial UI as permission to act. */
export function lightChatStatus(authorization: LightAuthorization): string {
  if (authorization.turn === 0) return 'Ready.';
  if (authorization.cancelled) return 'Stopped. Send a message to try again.';
  if (authorization.error)
    return 'The request failed. Send a message to try again.';
  if (!authorization.settled) return 'Waiting for a reply…';
  if (authorization.finishReason !== 'stop' || authorization.interrupted)
    return 'Reply incomplete. Send a message to try again.';
  return 'Reply complete. Review any proposal before applying.';
}
