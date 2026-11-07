import type { ResumeEntry } from '@hashbrownai/core';
/** Builds the complete exact native approval wire batch without mutating interrupts. */
export declare function nativeDecisions(
  interrupts: readonly { readonly id: string }[],
  decision: 'approve' | 'decline' | 'cancel',
): ResumeEntry[];
