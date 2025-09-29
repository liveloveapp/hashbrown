import { s } from '@hashbrownai/core';

export const CreateScene = s.object('Create a Scene', {
  type: s.literal('Create Scene'),
  name: s.string('The name of the scene'),
  lights: s.array(
    'The lights in the scene',
    s.object('A light in the scene', {
      lightId: s.string('The ID of the light'),
      brightness: s.integer('The brightness of the light'),
    }),
  ),
});

export const AddLightToScene = s.object('Add a Light to a Scene', {
  type: s.literal('Add Light to Scene'),
  lightId: s.string('The ID of the light'),
  sceneId: s.string('The ID of the scene'),
  brightness: s.integer('The brightness of the light'),
});

export const RemoveLightFromScene = s.object('Remove a Light from a Scene', {
  type: s.literal('Remove Light from Scene'),
  lightId: s.string('The ID of the light'),
  sceneId: s.string('The ID of the scene'),
});

export const SuggestionsSchema = s.object('List of Suggestions', {
  suggestions: s.streaming.array(
    'The suggestions',
    s.anyOf([CreateScene, AddLightToScene, RemoveLightFromScene]),
  ),
});

export type Suggestions = s.Infer<
  typeof SuggestionsSchema
>['suggestions'][number];
