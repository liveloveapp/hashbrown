/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  computed,
  inject,
  Injectable,
  linkedSignal,
  signal,
  untracked,
  WritableSignal,
} from '@angular/core';
import { structuredCompletionResource } from '@hashbrownai/angular';
import { SmartHome } from '../smart-home';
import { Suggestions, SuggestionsSchema } from './suggestions-schema';

@Injectable({ providedIn: 'root' })
export class Suggestor {
  private readonly smartHome = inject(SmartHome);
  private readonly lastAction = signal<{
    userAction: string;
    payload: object;
  } | null>(null);
  private readonly suggestionsResource = structuredCompletionResource({
    model: 'gpt-4.1',
    debugName: 'suggestionsResource',
    system: `
      You are an AI smart home assistant tasked with predicting the next possible user action in a 
      smart home configuration app. Your suggestions will be displayed as floating cards in the 
      bottom right of the screen.

      Rules:
      - Always check the current lights and scenes states to avoid suggesting duplicates.
      - If a new light has just been added, consider suggesting complementary lights or adding it 
        to an existing scene.
      - When recommending scene modifications, ensure that the scene does not already contain the 
        light in question.
      - You do not always need to make a prediction. Returning an empty array is also a valid 
        response.
      - You may make multiple predictions. Just add multiple predictions to the array.
    `,
    input: computed(
      () => {
        const lastAction = this.lastAction();
        const lights = untracked(() => this.smartHome.lights());
        const scenes = untracked(() => this.smartHome.scenes());

        if (lastAction === null) return null;

        return {
          lastAction,
          lights,
          scenes,
        };
      },
      { equal: (a, b) => this.isDeepEqual(a, b) },
    ),
    schema: SuggestionsSchema,
  });

  private readonly suggestionsList: WritableSignal<Suggestions[]> =
    linkedSignal({
      source: this.suggestionsResource.value,
      computation: (source): Suggestions[] => {
        if (source === undefined || source === null) return [];

        return source.suggestions;
      },
    });
  readonly suggestions = this.suggestionsList.asReadonly();
  readonly error = this.suggestionsResource.error;
  readonly isLoading = this.suggestionsResource.isLoading;

  private isDeepEqual(a: any, b: any): boolean {
    if (a === b) return true;

    if (a === null || b === null) return a === b;

    if (typeof a !== typeof b) return false;

    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((val, i) => this.isDeepEqual(val, b[i]));
    }

    if (typeof a === 'object' && typeof b === 'object') {
      const aKeys = Object.keys(a);
      const bKeys = Object.keys(b);
      if (aKeys.length !== bKeys.length) return false;
      return aKeys.every(
        (key) => bKeys.includes(key) && this.isDeepEqual(a[key], b[key]),
      );
    }

    return false;
  }

  notify(userAction: string, payload: object): void {
    this.lastAction.set({ userAction, payload });
  }

  removeSuggestion(index: number) {
    this.suggestionsList.update((suggestions) =>
      suggestions.filter((_, i) => i !== index),
    );
  }
}
