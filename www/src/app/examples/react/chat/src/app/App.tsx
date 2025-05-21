import { Chat, s } from '@hashbrownai/core';
import { createTool, createToolWithArgs, useUiChat } from '@hashbrownai/react';
import React, { ReactElement, useMemo } from 'react';
import styles from './App.module.css';
import { Composer } from './components/Composer';
import { Light } from './components/Light';
import { Messages } from './components/Messages';
import { useSmartHomeStore } from './store/smart-home.store';

export default function App(): ReactElement {
  const lights = useSmartHomeStore((state) => state.lights);

  const { messages, sendMessage, isSending, isReceiving, isRunningToolCalls } =
    useUiChat({
      model: 'gpt-4o',
      prompt:
        'You are a smart home assistant. You can control the lights in the house.',
      tools: [
        createTool({
          name: 'getLights',
          description: 'Get the current lights',
          handler: () => Promise.resolve(useSmartHomeStore.getState().lights),
        }),
        createToolWithArgs({
          name: 'controlLight',
          description:
            'Control the light. Brightness is a number between 0 and 100.',
          schema: s.object('Control light input', {
            lightId: s.string('The id of the light'),
            brightness: s.number(
              'The brightness of the light, between 0 and 100',
            ),
          }) as unknown as s.ObjectType<
            Record<string, s.HashbrownType<unknown>>
          >,
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
      ],
    });

  const isWorking = useMemo(() => {
    return isSending || isReceiving || isRunningToolCalls;
  }, [isSending, isReceiving, isRunningToolCalls]);

  return (
    <main>
      <div className={styles.app}>
        <div className={styles.lights}>
          <h3>Lights</h3>
          {lights.map((light) => (
            <button key={light.id}>
              <Light key={light.id} light={light} />
            </button>
          ))}
        </div>
        <div className={styles.chat}>
          <Messages messages={messages} />
          <Composer onSend={sendMessage} />
        </div>
      </div>
    </main>
  );
}
