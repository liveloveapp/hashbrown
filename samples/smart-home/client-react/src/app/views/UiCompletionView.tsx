import { exposeComponent, s } from '@hashbrownai/core';
import { createTool, createToolWithArgs } from '@hashbrownai/react';
import { CardComponent } from '../shared/CardComponent';
import { MarkdownComponent } from '../shared/MarkdownComponent';
import { useSmartHomeStore } from '../store/smart-home.store';
import { LightChatComponent } from '../views/components/LightChatComponent';

export const UiCompletionView = () => {
  const model = 'gpt-4o';
  const tools = [
    createTool({
      name: 'getLights',
      description: 'Get the current lights',
      handler: async () => useSmartHomeStore.getState().lights,
    }),
    createToolWithArgs({
      name: 'controlLight',
      description:
        'Control the light. Brightness is a number between 0 and 100.',
      schema: s.object('Control light input', {
        lightId: s.string('The id of the light'),
        brightness: s.number('The brightness of the light, between 0 and 100'),
      }) as unknown as s.ObjectType<Record<string, s.HashbrownType<unknown>>>,
      handler: (input: object) => {
        const { lightId, brightness } = input as {
          lightId: string;
          brightness: number;
        };
        useSmartHomeStore.getState().updateLight(lightId, {
          brightness,
        });
        return Promise.resolve(true);
      },
    }),
  ];
  const components = [
    exposeComponent(LightChatComponent, {
      name: 'LightChatComponent',
      description: 'A component that lets the user control a light',
      props: {
        lightId: s.string('The id of the light'),
      },
    }),
    exposeComponent(MarkdownComponent, {
      name: 'MarkdownComponent',
      description: 'Show markdown content to the user',
      props: {
        content: s.streaming.string('The content of the markdown'),
      },
    }),
    exposeComponent(CardComponent, {
      name: 'CardComponent',
      description: 'Show a card with children components to the user',
      children: 'any',
      props: {
        title: s.string('The title of the card'),
        description: s.streaming.string('The description of the card'),
      },
    }),
  ];

  return (
    <div className="flex flex-col gap-2">
      {/* <UiCompletion
        model={model}
        prompt="Can you generate me a light control card for each of my rooms? Use my light names to decide which rooms exist. For example, grouping all the kitchen related lights."
        tools={tools}
        components={components}
      /> */}
    </div>
  );
};
