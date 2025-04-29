import { computed, inject, Injectable, signal } from '@angular/core';
import { ConfigService } from './ConfigService';
import { ReferenceService } from './ReferenceService';
import { link, Section, section } from '../models/menu.models';

const ANGULAR_LINKS = section('Docs', [
  section('Start', [
    link('Quick Start', '/docs/angular/start/quick'),
    link('Platforms', '/docs/angular/start/platforms'),
  ]),
  section('Concepts', [
    link('Functions', '/docs/angular/concept/functions'),
    link('Structured Output', '/docs/angular/concept/structured-output'),
    link('Streaming', '/docs/angular/concept/streaming'),
  ]),
  section('AI Guide', [
    link('Prompt Engineering', '/docs/angular/guide/prompt-engineering'),
    link('Ethics', '/docs/angular/guide/ethics'),
    link('Choosing model', '/docs/angular/guide/choosing-model'),
  ]),
  section('Plugins', [
    link('JavaScript VM', '/docs/angular/plugins/javascript'),
  ]),
]);

const REACT_LINKS = section('Docs', [
  section('Start', [
    link('Quick Start', '/docs/react/start/quick'),
    link('Platforms', '/docs/react/start/platforms'),
  ]),
  section('Concepts', [
    link('Functions', '/docs/react/concept/functions'),
    link('Structured Output', '/docs/react/concept/structured-output'),
    link('Streaming', '/docs/react/concept/streaming'),
  ]),
  section('AI Guide', [
    link('Prompt Engineering', '/docs/react/guide/prompt-engineering'),
    link('Ethics', '/docs/react/guide/ethics'),
    link('Choosing model', '/docs/react/guide/choosing-model'),
  ]),
  section('Plugins', [link('JavaScript VM', '/docs/react/plugins/javascript')]),
]);

@Injectable({ providedIn: 'root' })
export class MenuService {
  configService = inject(ConfigService);
  referenceService = inject(ReferenceService);
  docs = computed(() => {
    return this.configService.config().sdk === 'angular'
      ? ANGULAR_LINKS
      : REACT_LINKS;
  });
  refs = signal<Section>(this.referenceService.getSection());
}
