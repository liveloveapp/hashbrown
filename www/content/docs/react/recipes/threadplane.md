---
title: 'Threadplane Chat: Hashbrown React Docs'
meta:
  - name: description
    content: 'Keep Hashbrown useChat and its server endpoint while composing a React conversation with Threadplane source-workspace chat components.'
---

# Chat with Threadplane

<hb-docs-demo demo="canonical-workbench-threadplane-react">
</hb-docs-demo>

Let's give our plan a chat screen. We'll ask for two steps, read the response as it arrives, and make the second step shorter.

Hashbrown owns the React conversation. Threadplane gives us the transcript, composer, and Send and Stop controls. If you're replacing an existing screen, start with the [migration checklist](/docs/react/migrations/threadplane).

<img src="/video/docs/canonical-workbench-threadplane-react-result.png" alt="The React Threadplane chat shows the two-step trusted UI plan and its shorter second step beside the captured requests, state and bottom timeline." width="1600" height="1000" loading="lazy" />

The recording uses the actual separately installed React consumer, the Hashbrown OpenAI server adapter, and real provider output. The canonical workbench adds the request inspector and synchronized timeline around Threadplane's own chat controls. Footage runs at actual speed with reading pauses and no narration.

This is a text conversation. The **JSON** view shows actual protocol events. It doesn't turn the reply into a typed plan or apply it to application state. **Replay** follows captured text and requests without sending another message.

## Before we start

Start with the [Quickstart](/docs/react/start/quick) server and a Vite application using TypeScript. The installed consumer for this walkthrough uses **React and React DOM 19.2.8** with **Hashbrown core and React 0.8.0**.

Threadplane’s React peer range starts at React 19.2.4; keep React and React DOM on matching versions. Keep the server's API key and model configuration on the server. The browser will continue to call `/api/chat` through the existing development proxy.

The React components used here are in Threadplane's **source workspace**. At the checked revision, `@threadplane/react`, `@threadplane/core`, and `@threadplane/content` are private packages. We'll build and install those local packages. There is no registry installation command for them in this recipe.

The example uses the APIs at [Threadplane revision `2c7f01f`](https://github.com/cacheplane/threadplane/tree/2c7f01fa958441f3ed94e2559987217be284e94a/libs/react). Keep the three local packages at that same revision.

## Build the local packages

Clone Threadplane beside your existing frontend directory. Replace `your-react-app` below with that directory's name. Run the build inside the Threadplane checkout:

```sh
cd ..
git clone https://github.com/cacheplane/threadplane.git threadplane
cd threadplane
git checkout 2c7f01fa958441f3ed94e2559987217be284e94a
npm ci
npx nx build react
```

The React build also builds its workspace dependencies. Install the resulting packages in your frontend:

```sh
cd ../your-react-app
npm install --install-links ../threadplane/dist/libs/core ../threadplane/dist/libs/content ../threadplane/dist/libs/react
```

Use [`--install-links`](https://docs.npmjs.com/cli/v11/commands/npm-install/#install-links) to pack these external directory dependencies into regular installed packages. This keeps their peer resolution in your frontend's dependency tree, rather than following a symlink back to the Threadplane checkout and potentially loading another React instance or missing local peers. The flag doesn't change npm workspace links.

Keep your existing `@hashbrownai/core` and `@hashbrownai/react` dependencies. These local Threadplane packages supply presentation; they don't replace the Hashbrown runtime.

Make sure the frontend TypeScript configuration includes Vite's client types. They provide declarations for imports such as `@threadplane/react/chat/styles.css`:

```json
{
  "compilerOptions": {
    "types": ["vite/client", "react", "react-dom"]
  }
}
```

Merge this setting into the existing frontend `tsconfig`; keep its other options. If the starter has a `src/vite-env.d.ts` that references `vite/client` already, retain that reference. Restart the development server after changing the configuration.

## Add the conversation

Create `src/ThreadplaneChat.tsx`. We select the user and assistant text from `useChat`, retaining each message's stable ID. Activity messages and synthetic errors have different shapes, so they don't become transcript rows.

`ChatInput` calls our `onSubmit` handler with the draft. Returning `false` keeps the draft when we can't send. An accepted submission returns `true`, which lets the composer clear it.

<hb-expander title="Complete src/ThreadplaneChat.tsx">

<hb-code-example header="src/ThreadplaneChat.tsx">

```tsx
import { useChat } from '@hashbrownai/react';
import { ChatInput, TextTranscript } from '@threadplane/react/chat';

/** Presents a Hashbrown text conversation with Threadplane controls. */
export function ThreadplaneChat() {
  const chat = useChat({
    system:
      'Help a developer discuss a two-step plan for a trusted UI demo. Keep replies short.',
    debugName: 'threadplane-chat',
  });
  const busy =
    chat.isSending || chat.isReceiving || chat.isGenerating || chat.isLoading;
  const rows = chat.messages.flatMap((message) =>
    (message.role === 'user' || message.role === 'assistant') &&
    typeof message.content === 'string'
      ? [{ id: message.id, role: message.role, content: message.content }]
      : [],
  );

  return (
    <main className="tp-chat">
      <h1>A plan, built together</h1>
      <TextTranscript messages={rows} label="Conversation" />
      {chat.error && (
        <p role="alert">
          The request failed. Check your connection and try again.
        </p>
      )}
      <ChatInput
        label="Your message"
        defaultValue="Create a two-step plan for a trusted UI demo."
        busy={busy}
        onSubmit={(text) => {
          if (busy || !text.trim()) return false;
          chat.sendMessage({ role: 'user', content: text.trim() });
          return true;
        }}
        onStop={() => {
          if (busy) chat.stop();
        }}
      />
      <p role="status">{busy ? 'Receiving a reply…' : 'Ready'}</p>
    </main>
  );
}
```

</hb-code-example>

</hb-expander>

The transcript renders text literally, including Markdown punctuation. This small composition doesn't project citations, reasoning, tool cards, or generated components. The [migration guide](/docs/react/migrations/threadplane) covers those boundaries.

## Mount it under HashbrownProvider

Replace the Quickstart's root component with `ThreadplaneChat`. Import Threadplane's opt-in chat stylesheet once in the frontend entry point:

<hb-expander title="Complete src/main.tsx">

<hb-code-example header="src/main.tsx">

```tsx
import { createRoot } from 'react-dom/client';
import { HashbrownProvider } from '@hashbrownai/react';
import '@threadplane/react/chat/styles.css';
import { ThreadplaneChat } from './ThreadplaneChat';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <HashbrownProvider url="/api/chat">
    <ThreadplaneChat />
  </HashbrownProvider>,
);
```

</hb-code-example>

</hb-expander>

Keep the Quickstart proxy in `vite.config.ts`: `/api` forwards to `http://127.0.0.1:3001`. Start the existing Node server in one terminal, then run the frontend from your React project in another:

```sh
npm run dev
```

No Threadplane server or extra browser endpoint is needed.

`useChat` owns this conversation's runtime and history. `TextTranscript` receives rows; `ChatInput` receives callbacks. They don't create another agent session. Keep the hook's owner mounted while you want to retain its in-memory conversation.

## Send, stop, and try again

Send **Create a two-step plan for a trusted UI demo.** You should see your message followed by a streaming assistant reply. Then send **Make the second step shorter. Keep the title and first step exactly the same.** The same `useChat` instance sends the first question and completed assistant reply with that follow-up. Enter sends; Shift+Enter adds a line. Accepted sends clear the draft and return focus to the composer.

Select **Stop** during a response to cancel the active request. With the tested Hashbrown **0.8.0** client, the unfinished assistant reply is removed; completed turns stay in the conversation. If a request fails, the page displays an error; restore the connection and explicitly send again. There is no automatic message on page load or automatic retry in this component.

Follow the two turns in the workbench. **Text** shows the response as it arrives. **Requests** shows the actual `/api/chat` envelope, response, and decoded events. Inspect the second request: it includes the first user message, the completed assistant reply, and the follow-up.

Select **UI** to see which components display the conversation and which runtime owns it. Select **State**: the application revision stays at zero. Explaining a plan doesn't accept it. Use the bottom timeline to revisit a turn; the live composer is hidden while replay is selected. Return to live to continue.

The server instructions ask for a short title, two numbered steps, and a follow-up that preserves the title and first step. The recording checks that the second step is shorter. Your model's wording can vary; inspect the actual response before relying on its content.

The workbench shell is an optional teaching layer around the installed consumer. The component and mounting code above work without it. Its [capture and playback source](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/quickstart/runtime/workbench-threadplane.ts) observes the actual response bytes; it doesn't supply replies. The [checked server](https://github.com/liveloveapp/hashbrown/blob/main/www/examples/threadplane-consumers/server/threadplane-app.ts) pins this lesson's plan instructions after request mapping.

The server still owns authentication, authorization, provider credentials, and model selection. The browser `system` option supplies model instructions; it isn't an access-control boundary. Use the [public endpoint pattern](/docs/react/recipes/public-endpoint) for an application that accesses customer data, and [server request customization](/docs/react/concept/transform-request-options) for trusted instructions and context.

## Next steps

Read [Migrate chat presentation to Threadplane](/docs/react/migrations/threadplane) before replacing an existing screen. For saved conversations, review [Message history](/docs/react/concept/message-history). The source contracts are in [ChatInput](https://github.com/cacheplane/threadplane/blob/2c7f01fa958441f3ed94e2559987217be284e94a/libs/react/src/chat/chat-input.tsx) and [TextTranscript](https://github.com/cacheplane/threadplane/blob/2c7f01fa958441f3ed94e2559987217be284e94a/libs/react/src/chat/text-transcript.tsx).

The [conversation workbench guide](/docs/react/start/workbench#inspect-and-replay) explains the inspector, keyboard controls, and read-only playback.
