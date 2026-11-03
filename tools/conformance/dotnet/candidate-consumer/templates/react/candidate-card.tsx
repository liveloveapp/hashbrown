import { exposeComponent } from '@hashbrownai/react';
import { s } from '@hashbrownai/core';

/** The only trusted component offered by the candidate UI facades. */
export function CandidateCard({ text }: { text: string }) {
  return <p data-testid="candidate-card">{text}</p>;
}

/** Stable component declaration and exact validated text property. */
export const candidateComponents = [
  exposeComponent(CandidateCard, {
    name: 'CandidateCard',
    description: 'Display a candidate answer',
    props: { text: s.string('Answer') },
    children: false,
  }),
];
