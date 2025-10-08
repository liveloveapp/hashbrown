---
title: 'Building a Chatbot with Generative UI and Tool Calling: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'This step-by-step guide will walk you through building a conversational Smart Home chatbot using Hashbrown''s @hashbrownai/angular!uiChatResource:function. Our assistant will:'
---
# Building a Chatbot with Generative UI and Tool Calling

This step-by-step guide will walk you through building a conversational Smart Home chatbot using Hashbrown's @hashbrownai/angular!uiChatResource:function. Our assistant will:

- Let users control and view smart home lights and scenes via natural language
- Enable the LLM to call tools for fetching and controlling devices
- Let the LLM generate interactive UI using Angular components (with real-time streaming)

We will expose only the components and actions we trust, so the assistant can only act within safe boundaries defined by your app.

---

## Before you start

**Prerequisites:**

- Familiarity with Angular and modern component syntax (signals, standalone components)
- Angular 20 or higher, with [standalone components and the Resources API](https://angular.dev)
- A working Hashbrown setup ([Hashbrown Quick Start](/docs/angular/start/quick))
- Install dependencies:

<hb-code-example header="terminal">

```sh
npm install @hashbrownai/angular @hashbrownai/core @hashbrownai/openai ngx-markdown
```

</hb-code-example>

We'll use `gpt-4.1` as our model and the OpenAI Hashbrown adapter, but you can use any supported provider.

---

## 1. Set Up Smart Home Service

First, define basic types and a minimal SmartHome service in your app for lights and scenes.

<hb-code-example header="smart-home.service.ts">

```ts
import { Injectable, signal } from '@angular/core';

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

@Injectable({ providedIn: 'root' })
export class SmartHome {
  private readonly _lights = signal<Light[]>([
    { id: 'living', name: 'Living Room', brightness: 80 },
    { id: 'bedroom', name: 'Bedroom', brightness: 40 },
    { id: 'kitchen', name: 'Kitchen', brightness: 100 },
  ]);
  private readonly _scenes = signal<Scene[]>([
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
  ]);

  readonly lights = this._lights.asReadonly();
  readonly scenes = this._scenes.asReadonly();

  setLightBrightness(lightId: string, brightness: number) {
    this._lights.update((lights) =>
      lights.map((l) => (l.id === lightId ? { ...l, brightness } : l)),
    );
  }

  applyScene(sceneId: string) {
    const scene = this._scenes().find((s) => s.id === sceneId);
    if (scene)
      for (const { lightId, brightness } of scene.lights) {
        this.setLightBrightness(lightId, brightness);
      }
  }
}
```

</hb-code-example>

We are going to expose this service to a large-language model, letting it call these methods to read the state of the smart home, control lights, and apply scenes.

---

## 2. Define Smart Home Tools

Tools are how we expose app services to the model. A tool is simply an async function that runs in Angular's dependency injection context, letting you expose any kind of service to the LLM. We are going to use tools to let LLMs fetch device data and perform control actions.

Let's start with a simple tool that lets the LLM get the list of lights and scenes:

<hb-code-example header="tools.ts">

```ts
import { inject } from '@angular/core';
import { createTool } from '@hashbrownai/angular';
import { SmartHome } from './smart-home.service';

export const getLights = createTool({
  name: 'getLights',
  description: 'Get all lights and their current state',
  handler: () => {
    const smartHome = inject(SmartHome);

    return smartHome.lights();
  },
});

export const getScenes = createTool({
  name: 'getScenes',
  description: 'Get all available scenes',
  handler: () => {
    const smartHome = inject(SmartHome);

    return smartHome.scenes();
  },
});
```

</hb-code-example>

Let's break down @hashbrownai/angular!createTool:function:

1.  `name` - A `camelCase` or `snake_case` string that serves as the _name_ of the tool.
2.  `description` - A clear, natural-language description of what purpose the tool serves. The LLM will use this description to determine when the tool should be called.
3.  `handler` - An async function that runs in Angular's dependency injection context. We use it to inject the services we want to call, returning any data that we want to feed into the LLM's context. It is important to note that all of the returned data will be in the context, and you pay for context both in terms of _token cost_ and _compute_. Be intentional with the data you return from tool calls.

Tools can accept arguments, which the LLM will generate as part of its tool call. In Hashbrown, tool call arguments are defined using Skillet for the schema:

<hb-code-example header="tools.ts">

```ts
import { s } from '@hashbrownai/core';

export const controlLight = createTool({
  name: 'controlLight',
  description: 'Set the brightness of a light',
  schema: s.object('Control light input', {
    lightId: s.string('The id of the light'),
    brightness: s.number('The new brightness (0-100)'),
  }),
  handler: ({ lightId, brightness }) => {
    inject(SmartHome).setLightBrightness(lightId, brightness);
    return { success: true };
  },
});

export const controlScene = createTool({
  name: 'controlScene',
  description: 'Apply a scene (adjust all lights in the scene)',
  schema: s.object('Control scene input', {
    sceneId: s.string('The id of the scene'),
  }),
  handler: ({ sceneId }) => {
    inject(SmartHome).applyScene(sceneId);
    return { success: true };
  },
});
```

</hb-code-example>

**How Skillet helps:** Skillet schemas (`s.object`, `s.string`, etc.) define arguments/outputs for tool calling, and make the expected contract transparent to the LLM (and typesafe for you). Skillet is Hashbrown's secret sauce for generative, safe, and streamable UI. Each part of the schema requires a description, encouraging you to be explicit and clear with the LLM about the data structure you are asking it to generate.

---

## 3. Create Angular UI Components

With tools, the LLM will be able to call the Angular services we've exposed to it. Now, let's give it a set of Angular components to render the results. We will expose only **the components we want the LLM to use**. The LLM cannot render anything other than the components you expose.

### 3.1. Markdown Renderer

Again, the LLM can only generate UIs using the components you provide it. Because of this constraint, first we need to give the LLM some way to render basic text responses to the user. Let's create a Markdown component that wraps `ngx-markdown`

<hb-code-example header="app-markdown.ts">

```ts
import { Component, signal, input } from '@angular/core';
import { MarkdownModule } from 'ngx-markdown';

@Component({
  selector: 'app-markdown',
  imports: [MarkdownModule],
  template: `<markdown [data]="content()"></markdown>`,
})
export class Markdown {
  readonly content = input.required<string>();
}
```

</hb-code-example>

### 3.2. Card Component

Next, let's make a Card component that it can use to show cards with child content:

<hb-code-example header="app-card.ts">

```ts
import { Component, input } from '@angular/core';

@Component({
  selector: 'app-card',
  template: `
    <div class="card">
      <h3>{{ title() }}</h3>
      <ng-content></ng-content>
    </div>
  `,
})
export class Card {
  readonly title = input.required<string>();
}
```

</hb-code-example>

### 3.3. Light List Item

A way to show a single light (often as a child of a card):

<hb-code-example header="app-light-list-item.ts">

```ts
import { Component, inject, input, computed } from '@angular/core';
import { SmartHome } from './smart-home.service';

@Component({
  selector: 'app-light-list-item',
  template: `
    @let light = light();
    @if (light) {
      <div class="light-item">💡 {{ light.name }} — {{ light.brightness }}%</div>
    } else {
      <div>Unknown light: {{ lightId() }}</div>
    }
  `,
})
export class LightListItem {
  private smartHome = inject(SmartHome);
  readonly lightId = input.required<string>();
  readonly light = computed(() =>
    this.smartHome.lights().find((l) => l.id === this.lightId()),
  );
}
```

</hb-code-example>

### 3.4. Scene List Item

And finally a way to show a scene:

<hb-code-example header="app-scene-list-item.ts">

```ts
import {
  Component,
  inject,
  input,
  output,
  signal,
  computed,
} from '@angular/core';
import { SmartHome } from './smart-home.service';

@Component({
  selector: 'app-scene-list-item',
  template: `
    @let scene = scene();
    @if (scene) {
      <div class="scene-item">
        <span>{{ scene.name }}</span>
        <button (click)="apply()">Apply</button>
      </div>
    } else {
      <div>Unknown scene: {{ sceneId() }}</div>
    }
  `,
})
export class SceneListItem {
  private smartHome = inject(SmartHome);
  readonly sceneId = input.required<string>();
  readonly scene = computed(() =>
    this.smartHome.scenes().find((s) => s.id === this.sceneId()),
  );

  apply() {
    if (this.scene()) this.smartHome.applyScene(this.scene()!.id);
  }
}
```

</hb-code-example>

You can style and extend these as you like. We will use Skillet to let the LLM generate values for our component inputs.

---

## 4. Expose Components to the Model

### Why only exposed components?

The LLM can only generate UI **using Angular components you explicitly expose via Hashbrown**. This is critical for safety and predictability.

Let's use @hashbrownai/angular!exposeComponent:function and Skillet schemas to share each component one-by-one, starting with Markdown.

### 4.1. Expose Markdown Component

<hb-code-example header="exposed-components.ts">

```ts
import { exposeComponent } from '@hashbrownai/angular';
import { s } from '@hashbrownai/core';
import { Markdown } from './app-markdown';

export const markdownComponent = exposeComponent(Markdown, {
  description: 'Renders formatted markdown text in the chat',
  input: {
    content: s.streaming.string('Markdown body to display to the user'),
  },
});
```

</hb-code-example>

Let's break this down:

1. The first argument @hashbrownai/angular!exposeComponent:function expects is the component class. Hashbrown will use the component's selector as the unique identifier for the component. This can be overriden by optionally providing a `name`.
2. Like tools, `description` is a natural language description of the component. The LLM will use it to determine when to render the component.
3. The LLM can generate data for your component's inputs by specifying schema for each input on the component. Here we are leveraging Skillet's `streaming` keyword to bind a streaming string to the input, letting the component show realtime Markdown as it is getting generated.

Only after exposing the markdown component can the assistant send plain conversational answers.

### 4.2. Expose Card, Light, and Scene Components

You can now do the same for the rest:

<hb-code-example header="exposed-components.ts (cont.)">

```ts
import { Card } from './app-card';
import { LightListItem } from './app-light-list-item';
import { SceneListItem } from './app-scene-list-item';

export const exposedCardComponent = exposeComponent(Card, {
  description: 'Shows a card with a title and arbitrary children',
  input: {
    title: s.streaming.string('Title to display in the card header'),
  },
  children: 'any',
});

export const exposedLightListItemComponent = exposeComponent(LightListItem, {
  description: 'Display a light and its state, given the lightId',
  input: {
    lightId: s.string('The id of the light to display'),
  },
});

export const exposedSceneListItemComponent = exposeComponent(SceneListItem, {
  description: 'Display a scene (and let the user apply it) by id',
  input: {
    sceneId: s.string('The id of the scene to display'),
  },
});
```

</hb-code-example>

**How Skillet helps with components:**
The input schemas tell the LLM exactly what inputs are needed and whether they stream.

---

## 5. Create the Chat Resource

Now we tie it together, using @hashbrownai/angular!uiChatResource:function and passing the tools and exposed components (using Skillet!) in its options.

<hb-code-example header="app-chatbot.ts">

```ts
import { Component, signal } from '@angular/core';
import { uiChatResource } from '@hashbrownai/angular';
import { getLights, getScenes, controlLight, controlScene } from './tools';
import {
  exposedMarkdownComponent,
  exposedCardComponent,
  exposedLightListItemComponent,
  exposedSceneListItemComponent,
} from './exposed-components';

@Component({
  selector: 'app-chatbot',
  template: `
    <div class="chat-messages">
      @for (message of chat.value(); track $index) {
        @switch (message.role) {
          @case ('user') {
            <div class="chat-message user">{{ message.content }}</div>
          }
          @case ('assistant') {
            <div class="chat-message assistant">
              <hb-render-message [message]="message" />
            </div>
          }
        }
      }
    </div>
    <div class="chat-input">
      <input
        [value]="input()"
        (input)="input.set($event.target.value)"
        (keydown.enter)="send()"
        placeholder="Say something..."
      />
      <button (click)="send()">Send</button>
    </div>
  `,
})
export class Chatbot {
  readonly input = signal('');
  readonly chat = uiChatResource({
    model: 'gpt-4.1',
    debugName: 'smart-home-chatbot',
    system: `
      You are a smart home assistant chatbot. You can answer questions about and control lights and scenes.

      # Capabilities
      - Call functions to get all lights, get scenes, set a light's brightness, and apply scenes.

      # Rules
      - Always use the app-markdown component for simple explanations or answers. For lists, wrap app-light-list-item/app-scene-list-item in app-card.
      - If you want to show an example UI, use the following format:

      <ui>
        <app-card title="Bedroom Lights">
          <app-light-list-item lightId="light-id-bedroom" />
          <app-light-list-item lightId="living" />
        </app-card>
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

  send() {
    if (this.input().trim()) {
      this.chat.sendMessage({ role: 'user', content: this.input() });
      this.input.set('');
    }
  }
}
```

</hb-code-example>

Let's break this down:

1. We can loop over `chat.value()` to render each message, switching on `message.role` to determine if the message came from the user, the assistant, or an error message.
2. When creating `uiChatResource`, we provide:

- `model` - The model ID from your LLM provider, in this case `gpt-4.1` for the OpenAI adapter.
- `debugName` - Let's you debug and introspect the resource using the Redux Devtools browser extension.
- `system` - We use the @hashbrownai/core!prompt:function to create a system instruction with a clear role, capabilities, and rules. The @hashbrownai/core!prompt:function lets us write UI examples in our system instruction (using the `<ui>` XML tag). Hashbrown will convert them into the underlying JSON representation.
- `components` - The list of components we want the LLM to use when generating responses.
- `tools` - The list of tools we want to expose to the LLM in this chat. This could be a signal of tools if you want to change the list of tools dynamically.

---

## 6. Skillet in Action

Both tool calling (e.g., `controlLight`) and component exposure use Skillet schema. This means the LLM, via Hashbrown, knows
exactly what arguments and props it needs, resulting in less guesswork and more reliable, safe AI-driven UI.

- For **tools**, Skillet documents input arguments, enforced at runtime and LLM level.
- For **UI**, Skillet schemas describe inputs and children, so the LLM knows what it can render.
- Streaming markdown is easy by using `s.streaming.string()` in the exposed markdown component.

---

## 7. Run and Interact

Drop `<app-chatbot />` into your app (wrap with `provideHashbrown()` as per quick start) and try chatting:

<hb-code-example header="main.ts">

```ts
import { provideHashbrown } from '@hashbrownai/angular';

export const appConfig = {
  providers: [provideHashbrown({ baseUrl: '/api/chat' })],
};
```

</hb-code-example>

_Example user: "Show all scenes"_  
Assistant could reply with a markdown intro and a card containing a list of `<app-scene-list-item />`s. Hitting "Apply" on a scene list item will apply the scene in your backend.

Try controlling lights by ID or requesting lists for more sophisticated flows. The assistant cannot display anything except the components you expose, so you can safely continue adding components and functionality.

---

## Recap: What Did We Cook Up?

- **uiChatResource** gives you full-featured, streaming LLM chat, generative UI, and tool calling
- **Skillet schemas** make the contract clear (arguments, props) for both tools and UI
- Only **exposed components and tools** are available to the assistant, so you are always in control
- The model is your sous-chef: it does the prep and the plating, but only in your kitchen!

Ready to extend? Hashbrown's approach makes it trivial to add richer tools, more components, or stricter rules via your schemas and system instructions.

---

## Next Steps

- [Go deeper with Skillet schemas](/docs/angular/concept/schema)
- [Advanced system instructions and prompt engineering](/docs/angular/guide/prompt-engineering)
- [Explore streaming responses](/docs/angular/concept/streaming)
- [Try the open-source smart home Hashbrown example](https://github.com/liveloveapp/hashbrown)
