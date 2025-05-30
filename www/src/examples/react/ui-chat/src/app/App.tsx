import { s } from '@hashbrownai/core';
import {
  createTool,
  createToolWithArgs,
  exposeComponent,
  useUiChat,
} from '@hashbrownai/react';
import React, { ReactElement, useCallback, useMemo, useState } from 'react';
import styles from './App.module.css';
import Composer from './components/Composer';
import Config from './components/Config';
import Dialog from './components/Dialog';
import Light from './components/Light';
import Messages from './components/Messages';
import { useConfigStore } from './store/config.store';
import { useSmartHomeStore } from './store/smart-home.store';

export default function App(): ReactElement {
  const lights = useSmartHomeStore((state) => state.lights);
  const apiKey = useConfigStore((state) => state.apiKey);
  const setApiKey = useConfigStore((state) => state.setApiKey);
  const [showApiKeyDialog, setShowApiKeyDialog] = useState(false);

  const { messages, sendMessage, isSending, isReceiving, isRunningToolCalls } =
    useUiChat({
      model: 'gpt-4o',
      debugName: 'Example Chat',
      system:
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
      components: [
        exposeComponent(Light, {
          name: 'light',
          description: 'A componenet that lets the user control a light',
          props: {
            lightId: s.string('The id of the light'),
          },
        }),
      ],
    });

  const handleChange = useCallback(
    (message: string) => {
      if (!apiKey) {
        setShowApiKeyDialog(true);
        return;
      }

      sendMessage({
        role: 'user',
        content: message,
      });
    },
    [apiKey, sendMessage],
  );

  const isWorking = useMemo(() => {
    return isSending || isReceiving || isRunningToolCalls;
  }, [isSending, isReceiving, isRunningToolCalls]);

  return (
    <>
      <main>
        <div className={styles.app}>
          <div className={styles.config}>
            <Config />
          </div>
          <div className={styles.lights}>
            <h3>Lights</h3>
            {lights.map((light) => (
              <button key={light.id}>
                <Light key={light.id} lightId={light.id} />
              </button>
            ))}
          </div>
          <div className={styles.chat}>
            <Messages messages={messages} />
            <Composer onChange={handleChange} />
          </div>
        </div>
      </main>
      <Dialog
        open={showApiKeyDialog}
        onClose={() => setShowApiKeyDialog(false)}
        title="API Key"
      >
        <p>Please enter your API key. We do not store or transmit this.</p>
        <input
          type="password"
          placeholder="API Key"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
        <button onClick={() => setShowApiKeyDialog(false)}>Save</button>
      </Dialog>
    </>
  );
}
