import { Component, input } from '@angular/core';
import { exposeComponent } from '@hashbrownai/angular';
import { s } from '@hashbrownai/core';

/** The sole trusted Angular component offered to the actual UI facades. */
@Component({
  selector: 'candidate-card',
  standalone: true,
  template: '<p data-testid="candidate-card">{{ text() }}</p>',
})
export class CandidateCard {
  readonly text = input.required<string>();
}

/** Stable exact schema for the trusted component text input. */
export const candidateComponents = [
  exposeComponent(CandidateCard, {
    name: 'CandidateCard',
    description: 'Display a candidate answer',
    input: { text: s.string('Answer') },
    children: false,
  }),
];
