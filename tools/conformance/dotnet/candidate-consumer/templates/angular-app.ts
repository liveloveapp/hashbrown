import { Component, inject } from '@angular/core';
import { readCandidateConfiguration } from './candidate-runtime';
import { ChatLeaf } from './angular/chat';
import { StructuredChatLeaf } from './angular/structured-chat';
import { CompletionLeaf } from './angular/completion';
import { StructuredCompletionLeaf } from './angular/structured-completion';
import { UiChatLeaf } from './angular/ui-chat';
import { UiCompletionLeaf } from './angular/ui-completion';
import { CandidateFrameworkErrors } from './angular/panel';

/** Mounts exactly one actual public resource selected by explicit runner configuration. */
@Component({
  selector: 'candidate-app',
  standalone: true,
  imports: [
    ChatLeaf,
    StructuredChatLeaf,
    CompletionLeaf,
    StructuredCompletionLeaf,
    UiChatLeaf,
    UiCompletionLeaf,
  ],
  template: `@if (errors.failure(); as failure) {
      <pre [attr.data-testid]="failure.classification">{{ json(failure) }}</pre>
    }
    @switch (config.facade) {
      @case ('chat') {
        <candidate-chat />
      }
      @case ('structured-chat') {
        <candidate-structured-chat />
      }
      @case ('completion') {
        <candidate-completion />
      }
      @case ('structured-completion') {
        <candidate-structured-completion />
      }
      @case ('ui-chat') {
        <candidate-ui-chat />
      }
      @case ('ui-completion') {
        <candidate-ui-completion />
      }
    }`,
})
export class App {
  readonly config = readCandidateConfiguration();
  readonly errors = inject(CandidateFrameworkErrors);
  /** Displays the actual framework exception using escaped interpolation. */
  json(value: unknown): string {
    return JSON.stringify(value);
  }
}
