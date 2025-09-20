---
title: 'Building a Chatbot with Generative UI and Tool Calling: Hashbrown React Docs'
meta:
  - name: description
    content: 'This step-by-step guide will walk you through building a conversational Smart Home chatbot using Hashbrown''s useUiChat React hook. Our assistant will:'
---
# Building a Chatbot with Generative UI and Tool Calling

This step-by-step guide will walk you through building a conversational Smart Home chatbot using Hashbrown's `useUiChat` React hook. Our assistant will:

- Let users control and view smart home lights and scenes via natural language
- Enable the LLM to call tools for fetching and controlling devices
- Let the LLM generate interactive UI using React components (with real-time streaming)

We will expose only the components and actions we trust, so the assistant can only act within safe boundaries defined by your app.

---

## Before you start

**Prerequisites:**

- Familiarity with React and modern component syntax (function components, hooks)
- React 18 or higher
- A working Hashbrown setup ([Hashbrown Quick Start](/docs/react/start/quick))
- Install dependencies:

<hb-code-example header="terminal">

```sh
npm install @hashbrownai/react @hashbrownai/core @hashbrownai/openai react-markdown
```

</hb-code-example>

We'll use `gpt-4.1` as our model and the OpenAI Hashbrown adapter, but you can use any supported provider.

---

## 1. Set Up Smart Home Service

First, define basic types and a minimal SmartHome context in your app for lights and scenes.

<hb-code-example header="smart-home.ts">

```ts
import React, { createContext, useContext, useState, useCallback } from 'react';

export interface Light {
  id: string;
  name: string;
  brightness: number;
}

export interface Scene {
  id: string;
  name: string;
  lights: { lightId: string; brightness: number }[];
}

const defaultLights: Light[] = [
  { id: 'living', name: 'Living Room', brightness: 80 },
  { id: 'bedroom', name: 'Bedroom', brightness: 40 },
  { id: 'kitchen', name: 'Kitchen', brightness: 100 },
];

const defaultScenes: Scene[] = [
  {
    id: 'relax',
    name: 'Relax Mode',
    lights: [
      { lightId: 'living', brightness: 30 },
      { lightId: 'bedroom', brightness: 10 },
    ],
  },
  {
    id: 'party',
    name: 'Party Mode',
    lights: [
      { lightId: 'living', brightness: 100 },
      { lightId: 'kitchen', brightness: 100 },
    ],
  },
];

const SmartHomeContext = createContext<{
  lights: Light[];
  scenes: Scene[];
  setLightBrightness: (lightId: string, brightness: number) => void;
  applyScene: (sceneId: string) => void;
} | undefined>(undefined);

export const SmartHomeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lights, setLights] = useState<Light[]>(defaultLights);
  const [scenes] = useState<Scene[]>(defaultScenes);

  const setLightBrightness = useCallback((lightId: string, brightness: number) => {
    setLights((lights) =>
      lights.map((l) => (l.id === lightId ? { ...l, brightness } : l))
    );
  }, []);

  const applyScene = useCallback((sceneId: string) => {
    const scene = scenes.find((s) => s.id === sceneId);
    if (scene) {
      setLights((lights) =>
        lights.map((l) => {
          const match = scene.lights.find((li) => li.lightId === l.id);
          return match ? { ...l, brightness: match.brightness } : l;
        })
      );
    }
  }, [scenes]);

  return (
    <SmartHomeContext.Provider value={{ lights, scenes, setLightBrightness, applyScene }}>
      {children}
    </SmartHomeContext.Provider>
  );
};

export const useSmartHome = () => {
  const ctx = useContext(SmartHomeContext);
  if (!ctx) throw new Error('useSmartHome must be used within SmartHomeProvider');
  return ctx;
};
```

</hb-code-example>

We are going to expose this context to a large-language model, letting it call these methods to read the state of the smart home, control lights, and apply scenes.

---

## 2. Define Smart Home Tools

Tools are how we expose app services to the model. A tool is simply an async function that can access your app's state and perform actions. We are going to use tools to let LLMs fetch device data and perform control actions.

Let's start with a simple tool that lets the LLM get the list of lights and scenes:

<hb-code-example header="tools.ts">

```ts
import { useTool } from '@hashbrownai/react';
import { useSmartHome } from './smart-home';

export const useGetLightsTool = () => {
  const { lights } = useSmartHome();

  return useTool({
    name: 'getLights',
    description: 'Get all lights and their current state',
    deps: [lights],
    handler: () => {
      return lights;
    },
  });
};

export const useGetScenesTool = () => {
  const { scenes } = useSmartHome();

  return useTool({
    name: 'getScenes',
    description: 'Get all available scenes',
    deps: [scenes],
    handler: () => {
      return scenes;
    },
  });
};
```

</hb-code-example>

Let's break down `useTool`:

1.  `name` - A `camelCase` or `snake_case` string that serves as the _name_ of the tool.
2.  `description` - A clear, natural-language description of what purpose the tool serves. The LLM will use this description to determine when the tool should be called.
3.  `handler` - An async function that can access your app's state and perform actions. All of the returned data will be in the context, and you pay for context both in terms of _token cost_ and _compute_. Be intentional with the data you return from tool calls.
4.  `deps` - React dependency array for the hook.

Tools can accept arguments, which the LLM will generate as part of its tool call. In Hashbrown, tool call arguments are defined using Skillet for the schema:

<hb-code-example header="tools.ts">

```ts
import { s } from '@hashbrownai/core';
import { useTool } from '@hashbrownai/react';
import { useSmartHome } from './smart-home';

export const useControlLightTool = () => {
  const { setLightBrightness } = useSmartHome();

  return useTool({
    name: 'controlLight',
    description: 'Set the brightness of a light',
    schema: s.object('Control light input', {
      lightId: s.string('The id of the light'),
      brightness: s.number('The new brightness (0-100)'),
    }),
    deps: [setLightBrightness],
    handler: ({ lightId, brightness }) => {
      setLightBrightness(lightId, brightness);
      return { success: true };
    },
  });
};

export const useControlSceneTool = () => {
  const { applyScene } = useSmartHome();

  return useTool({
    name: 'controlScene',
    description: 'Apply a scene (adjust all lights in the scene)',
    schema: s.object('Control scene input', {
      sceneId: s.string('The id of the scene'),
    }),
    deps: [applyScene],
    handler: ({ sceneId }) => {
      applyScene(sceneId);
      return { success: true };
    },
  });
};
```

</hb-code-example>

**How Skillet helps:** Skillet schemas (`s.object`, `s.string`, etc.) define arguments/outputs for tool calling, and make the expected contract transparent to the LLM (and typesafe for you). Skillet is Hashbrown's secret sauce for generative, safe, and streamable UI. Each part of the schema requires a description, encouraging you to be explicit and clear with the LLM about the data structure you are asking it to generate.

---

## 3. Create React UI Components

With tools, the LLM will be able to call the services we've exposed to it. Now, let's give it a set of React components to render the results. We will expose only **the components we want the LLM to use**. The LLM cannot render anything other than the components you expose.

### 3.1. Markdown Renderer

Again, the LLM can only generate UIs using the components you provide it. Because of this constraint, first we need to give the LLM some way to render basic text responses to the user. Let's create a Markdown component that wraps `react-markdown`:

<hb-code-example header="Markdown.tsx">

```tsx
import React from 'react';
import ReactMarkdown from 'react-markdown';

export const Markdown: React.FC<{ content: string }> = ({ content }) => (
  <ReactMarkdown>{content}</ReactMarkdown>
);
```

</hb-code-example>

### 3.2. Card Component

Next, let's make a Card component that it can use to show cards with child content:

<hb-code-example header="Card.tsx">

```tsx
import React from 'react';

export const Card: React.FC<{ title: string; children?: React.ReactNode }> = ({
  title,
  children,
}) => (
  <div className="card">
    <h3>{title}</h3>
    {children}
  </div>
);
```

</hb-code-example>

### 3.3. Light List Item

A way to show a single light (often as a child of a card):

<hb-code-example header="LightListItem.tsx">

```tsx
import React, { useMemo } from 'react';
import { useSmartHome } from './smart-home';

export const LightListItem: React.FC<{ lightId: string }> = ({ lightId }) => {
  const { lights } = useSmartHome();
  const light = useMemo(() => {
    return lights.find((l) => l.id === lightId);
  }, [lights, lightId]);

  return light ? (
    <div className="light-item">
      💡 {light.name} — {light.brightness}%
    </div>
  ) : (
    <div>Unknown light: {lightId}</div>
  );
};
```

</hb-code-example>

### 3.4. Scene List Item

And finally a way to show a scene:

<hb-code-example header="SceneListItem.tsx">

```tsx
import React, { useMemo } from 'react';
import { useSmartHome } from './smart-home';

export const SceneListItem: React.FC<{ sceneId: string }> = ({ sceneId }) => {
  const { scenes, applyScene } = useSmartHome();
  const scene = useMemo(() => {
    return scenes.find((s) => s.id === sceneId);
  }, [scenes, sceneId]);

  return scene ? (
    <div className="scene-item">
      <span>{scene.name}</span>
      <button onClick={() => applyScene(scene.id)}>Apply</button>
    </div>
  ) : (
    <div>Unknown scene: {sceneId}</div>
  );
};
```

</hb-code-example>

You can style and extend these as you like. We will use Skillet to let the LLM generate values for our component props.

---

## 4. Expose Components to the Model

### Why only exposed components?

The LLM can only generate UI **using React components you explicitly expose via Hashbrown**. This is critical for safety and predictability.

Let's use `exposeComponent` and Skillet schemas to share each component one-by-one, starting with Markdown.

### 4.1. Expose Markdown Component

<hb-code-example header="exposed-components.ts">

```ts
import { exposeComponent } from '@hashbrownai/react';
import { s } from '@hashbrownai/core';
import { Markdown } from './Markdown';

export const exposedMarkdownComponent = exposeComponent(Markdown, {
  name: 'Markdown',
  description: 'Renders formatted markdown text in the chat',
  props: {
    content: s.streaming.string('Markdown body to display to the user'),
  },
});
```

</hb-code-example>

Let's break this down:

1. The first argument to `exposeComponent` is the React component.
2. The next argument we provide is a `TitleCase` unique name for the component.
3. Like tools, `description` is a natural language description of the component. The LLM will use it to determine when to render the component.
4. The LLM can generate data for your component's props by specifying schema for each prop. Here we are leveraging Skillet's `streaming` keyword to bind a streaming string to the prop, letting the component show realtime Markdown as it is getting generated.

Only after exposing the markdown component can the assistant send plain conversational answers.

### 4.2. Expose Card, Light, and Scene Components

You can now do the same for the rest:

<hb-code-example header="exposed-components.ts (cont.)">

```ts
import { Card } from './Card';
import { LightListItem } from './LightListItem';
import { SceneListItem } from './SceneListItem';

export const exposedCardComponent = exposeComponent(Card, {
  name: 'Card',
  description: 'Shows a card with a title and arbitrary children',
  props: {
    title: s.streaming.string('Title to display in the card header'),
  },
  children: 'any',
});

export const exposedLightListItemComponent = exposeComponent(LightListItem, {
  name: 'LightListItem',
  description: 'Display a light and its state, given the lightId',
  props: {
    lightId: s.string('The id of the light to display'),
  },
});

export const exposedSceneListItemComponent = exposeComponent(SceneListItem, {
  name: 'SceneListItem',
  description: 'Display a scene (and let the user apply it) by id',
  props: {
    sceneId: s.string('The id of the scene to display'),
  },
});
```

</hb-code-example>

**How Skillet helps with components:**
The prop schemas tell the LLM exactly what props are needed and whether they stream.

---

## 5. Create the Chat Hook

Now we tie it together, using `useUiChat` and passing the tools and exposed components (using Skillet!) in its options.

<hb-code-example header="Chatbot.tsx">

```tsx
import React, { useState } from 'react';
import { useUiChat } from '@hashbrownai/react';
import {
  useGetLightsTool,
  useGetScenesTool,
  useControlLightTool,
  useControlSceneTool,
} from './tools';
import {
  exposedMarkdownComponent,
  exposedCardComponent,
  exposedLightListItemComponent,
  exposedSceneListItemComponent,
} from './exposed-components';

export const Chatbot: React.FC = () => {
  const [input, setInput] = useState('');
  const getLights = useGetLightsTool();
  const getScenes = useGetScenesTool();
  const controlLight = useControlLightTool();
  const controlScene = useControlSceneTool();

  const { messages, sendMessage } = useUiChat({
    model: 'gpt-4.1',
    debugName: 'smart-home-chatbot',
    system: `
      You are a smart home assistant chatbot. You can answer questions about and control lights and scenes.

      # Capabilities
      - Call functions to get all lights, get scenes, set a light's brightness, and apply scenes.

      # Rules
      - Always use the Markdown component for simple explanations or answers. For lists, wrap LightListItem/SceneListItem in Card.
      - If you want to show an example UI, use the following format:

      <ui>
        <Card title="Bedroom Lights">
          <LightListItem lightId="bedroom" />
          <LightListItem lightId="living" />
        </Card>
      <ui>
    `,
    components: [
      exposedMarkdownComponent,
      exposedCardComponent,
      exposedLightListItemComponent,
      exposedSceneListItemComponent,
    ],
    tools: [getLights, getScenes, controlLight, controlScene],
  });

  const handleSend = () => {
    if (input.trim()) {
      sendMessage({ role: 'user', content: input });
      setInput('');
    }
  };

  return (
    <div>
      <div className="chat-messages">
        {messages.map((message, idx) => (
          <div key={idx} className={`chat-message ${message.role}`}>
            {message.role === 'user'
              ? message.content
              : message.role === 'assistant'
                ? message.ui
                : null}
          </div>
        ))}
      </div>
      <div className="chat-input">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Say something..."
        />
        <button onClick={handleSend}>Send</button>
      </div>
    </div>
  );
};
```

</hb-code-example>

Let's break this down:

1. We can loop over `messages` to render each message, switching on `message.role` to determine if the message came from the user, the assistant, or an error message.
2. When creating `useUiChat`, we provide:

- `model` - The model ID from your LLM provider, in this case `gpt-4.1` for the OpenAI adapter.
- `debugName` - Lets you debug and introspect the resource using the Redux Devtools browser extension.
- `system` - We use a system instruction with a clear role, capabilities, and rules. You can write UI examples in your system instruction (using the `<ui>` XML tag). Hashbrown will convert them into the underlying JSON representation.
- `components` - The list of components we want the LLM to use when generating responses.
- `tools` - The list of tools we want to expose to the LLM in this chat. This could be dynamic if you want to change the list of tools at runtime.

---

## 6. Skillet in Action

Both tool calling (e.g., `controlLight`) and component exposure use Skillet schema. This means the LLM, via Hashbrown, knows
exactly what arguments and props it needs, resulting in less guesswork and more reliable, safe AI-driven UI.

- For **tools**, Skillet documents input arguments, enforced at runtime and LLM level.
- For **UI**, Skillet schemas describe props and children, so the LLM knows what it can render.
- Streaming markdown is easy by using `s.streaming.string()` in the exposed markdown component.

---

## 7. Run and Interact

Wrap your app with `<HashbrownProvider url="/api/chat">` as per quick start, and try chatting:

<hb-code-example header="main.tsx">

```tsx
import React from 'react';
import { HashbrownProvider } from '@hashbrownai/react';
import { SmartHomeProvider } from './smart-home';
import { Chatbot } from './Chatbot';

export const App = () => (
  <HashbrownProvider url="/api/chat">
    <SmartHomeProvider>
      <Chatbot />
    </SmartHomeProvider>
  </HashbrownProvider>
);
```

</hb-code-example>

_Example user: "Show all scenes"_  
Assistant could reply with a markdown intro and a card containing a list of `<SceneListItem />`s. Hitting "Apply" on a scene list item will apply the scene in your backend.

Try controlling lights by ID or requesting lists for more sophisticated flows. The assistant cannot display anything except the components you expose, so you can safely continue adding components and functionality.

---

## Recap: What Did We Cook Up?

- **useUiChat** gives you full-featured, streaming LLM chat, generative UI, and tool calling
- **Skillet schemas** make the contract clear (arguments, props) for both tools and UI
- Only **exposed components and tools** are available to the assistant, so you are always in control
- The model is your sous-chef: it does the prep and the plating, but only in your kitchen!

Ready to extend? Hashbrown's approach makes it trivial to add richer tools, more components, or stricter rules via your schemas and system instructions.

---

## Next Steps

- [Go deeper with Skillet schemas](/docs/react/concept/schema)
- [Advanced system instructions and prompt engineering](/docs/react/guide/prompt-engineering)
- [Explore streaming responses](/docs/react/concept/streaming)
- [Try the open-source smart home Hashbrown example](https://github.com/liveloveapp/hashbrown)
