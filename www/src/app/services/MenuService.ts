import { computed, inject, Injectable, signal } from '@angular/core';
import { ConfigService } from './ConfigService';
import { ReferenceService } from './ReferenceService';
import { link, Section, section } from '../models/menu.models';

const DOCS_ANGULAR = section('Docs', [
  section('Start', [
    link('Quick Start', '/docs/angular/start/quick'),
    link('Sample App', '/docs/angular/start/sample'),
    link('Platforms', '/docs/angular/start/platforms'),
  ]),
  section('Concepts', [
    link('System Instructions', '/docs/angular/concept/system-instructions'),
    link('Generative UI', '/docs/angular/concept/components'),
    link('Function Calling', '/docs/angular/concept/functions'),
    link('Structured Output', '/docs/angular/concept/structured-output'),
    link('Skillet Schema', '/docs/angular/concept/schema'),
    link('Streaming', '/docs/angular/concept/streaming'),
    link('JS Runtime', '/docs/angular/concept/runtime'),
  ]),
  // section('Recipes', [
  //   link('Chat', '/docs/angular/recipes/chat'),
  //   link('Completion', '/docs/angular/recipes/completion'),
  // ]),
  // section('AI Guide', [
  //   link('Prompt Engineering', '/docs/angular/guide/prompt-engineering'),
  //   link('Ethics', '/docs/angular/guide/ethics'),
  //   link('Choosing model', '/docs/angular/guide/choosing-model'),
  // ]),
  section('Platforms', [
    link('Azure', '/docs/angular/platform/azure'),
    link('Google', '/docs/angular/platform/google'),
    link('OpenAI', '/docs/angular/platform/openai'),
    link('Writer', '/docs/angular/platform/writer'),
  ]),
]);

const DOCS_REACT = section('Docs', [
  section('Start', [
    link('Quick Start', '/docs/react/start/quick'),
    link('Sample App', '/docs/react/start/sample'),
    link('Platforms', '/docs/react/start/platforms'),
  ]),
  section('Concepts', [
    link('System Instructions', '/docs/react/concept/system-instructions'),
    link('Generative UI', '/docs/react/concept/components'),
    link('Function Calling', '/docs/react/concept/functions'),
    link('Structured Output', '/docs/react/concept/structured-output'),
    link('Skillet Schema', '/docs/react/concept/schema'),
    link('Streaming', '/docs/react/concept/streaming'),
  ]),
  // section('Recipes', [
  //   link('Chat', '/docs/react/recipes/chat'),
  //   link('Completion', '/docs/react/recipes/completion'),
  // ]),
  // section('AI Guide', [
  //   link('Prompt Engineering', '/docs/react/guide/prompt-engineering'),
  //   link('Ethics', '/docs/react/guide/ethics'),
  //   link('Choosing model', '/docs/react/guide/choosing-model'),
  // ]),
  section('Platforms', [
    link('Azure', '/docs/react/platform/azure'),
    link('Google', '/docs/react/platform/google'),
    link('OpenAI', '/docs/react/platform/openai'),
    link('Writer', '/docs/react/platform/writer'),
  ]),
]);

@Injectable({ providedIn: 'root' })
export class MenuService {
  configService = inject(ConfigService);
  referenceService = inject(ReferenceService);
  docs = computed(() => {
    return this.configService.sdk() === 'angular' ? DOCS_ANGULAR : DOCS_REACT;
  });
  refs = signal<Section>(this.referenceService.getSection());
}
