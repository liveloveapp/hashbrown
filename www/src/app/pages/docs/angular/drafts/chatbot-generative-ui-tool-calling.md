---
title: 'Building a Chatbot with Generative UI and Tool Calling in Angular: Hashbrown Angular Docs'
meta:
  - name: description
    content: 'This guide walks you step-by-step through building a modern chatbot in Angular using Hashbrown. You''ll learn how to:'
---
# Building a Chatbot with Generative UI and Tool Calling in Angular

This guide walks you step-by-step through building a modern chatbot in Angular using Hashbrown. You'll learn how to:

- Set up a chat interface with streaming responses
- Expose tools (function calls) for the LLM to use
- Enable generative UI: let the LLM render your Angular components
- Combine all these for a rich, interactive chatbot experience

---

## Before You Start

**Prerequisites:**

- Familiarity with Angular and component-based architecture
- Node.js and npm installed
- An OpenAI API key (or another supported LLM provider)

**Install Hashbrown and dependencies:**

```sh
npm install @hashbrownai/angular @hashbrownai/core @hashbrownai/openai ngx-markdown
```

---

## 1. Set Up the Hashbrown Provider

Wrap your app with `HashbrownProviderComponent` to configure the API endpoint and context. In your root component template (e.g., `app.component.html`):

```html
<hashbrown-provider [url]="'https://api.hashbrown.ai/v1'">
  <!-- Your routes/components here -->
</hashbrown-provider>
```

In your `app.module.ts`, import the Hashbrown module:

```ts
import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HashbrownModule } from '@hashbrownai/angular';
import { AppComponent } from './app.component';

@NgModule({
  declarations: [AppComponent],
  imports: [BrowserModule, HashbrownModule],
  bootstrap: [AppComponent],
})
export class AppModule {}
```

---

## 2. Create a Basic Chat Interface

Start with a simple chat using the `useChat` composable. This manages message state and streaming.

```ts
// chat-panel.component.ts
import { Component } from '@angular/core';
import { useChat } from '@hashbrownai/angular';

@Component({
  selector: 'app-chat-panel',
  templateUrl: './chat-panel.component.html',
  styleUrls: ['./chat-panel.component.css'],
})
export class ChatPanelComponent {
  input = '';
  chat = useChat({
    model: 'gpt-4.1',
    system:
      'You are a helpful assistant that can answer questions and help with tasks.',
  });

  get messages() {
    return this.chat.messages;
  }
  get isReceiving() {
    return this.chat.isReceiving;
  }

  handleSend() {
    if (!this.input.trim()) return;
    this.chat.sendMessage({ role: 'user', content: this.input });
    this.input = '';
  }
}
```

```html
<!-- chat-panel.component.html -->
<div>
  <div class="messages">
    <div *ngFor="let msg of messages" [ngClass]="msg.role">
      <p>{{ msg.content }}</p>
    </div>
    <div *ngIf="isReceiving">Assistant is typing...</div>
  </div>
  <form class="composer" (ngSubmit)="handleSend()">
    <input
      [(ngModel)]="input"
      name="chatInput"
      placeholder="Type your message…"
      autocomplete="off"
    />
    <button type="submit">Send</button>
  </form>
</div>
```

---

## 3. Add Tool Calling

Allow the LLM to call your backend functions ("tools"). Define each tool with `useTool` and pass them to the chat composable.

### Example: Exposing Tools

```ts
import { useTool } from '@hashbrownai/angular';
import { s } from '@hashbrownai/core';

// Example tool: get user info
export const getUserTool = useTool({
  name: 'getUser',
  description: 'Get information about the current user',
  handler: () => ({ id: 'user-1', name: 'Alice' }),
});

// Example tool: get lights
export const getLightsTool = useTool({
  name: 'getLights',
  description: 'Get the current lights',
  handler: async () => [
    { id: 'light-1', brightness: 75 },
    { id: 'light-2', brightness: 50 },
  ],
});

// Example tool: control a light
export const controlLightTool = useTool({
  name: 'controlLight',
  description: 'Control a light',
  schema: s.object('Control light input', {
    lightId: s.string('The id of the light'),
    brightness: s.number('The brightness of the light'),
  }),
  handler: async (input) => {
    // Replace with your update logic
    return { success: true };
  },
});
```

### Pass Tools to the Chat Composable

```ts
import { useChat } from '@hashbrownai/angular';
import { getUserTool, getLightsTool, controlLightTool } from './tools';

const chat = useChat({
  model: 'gpt-4.1',
  system:
    'You are a helpful assistant that can answer questions and help with tasks.',
  tools: [getUserTool, getLightsTool, controlLightTool],
});
```

**How it works:**

- The LLM can now choose to call these tools in response to user input.
- Tool calls and results are handled automatically by Hashbrown.

---

## 4. Enable Generative UI (LLM-Driven Angular Components)

Let the LLM render your Angular components by exposing them with `exposeComponent` and using `useUiChat`.

### Step 1: Define Components to Expose

```ts
import { exposeComponent } from '@hashbrownai/angular';
import { s } from '@hashbrownai/core';
import { Component, Input } from '@angular/core';

// Expose a Markdown renderer
import { MarkdownModule } from 'ngx-markdown';

@Component({
  selector: 'app-markdown',
  template: '<markdown [data]="content"></markdown>',
})
export class MarkdownComponent {
  @Input() content!: string;
}

export const ExposedMarkdownComponent = exposeComponent(MarkdownComponent, {
  name: 'markdown',
  description: 'Show markdown to the user',
  props: {
    content: s.streaming.string('The markdown content'),
  },
});

// Expose a Light component
@Component({
  selector: 'app-light',
  template: '<div>Light: {{ lightId }}</div>',
})
export class LightComponent {
  @Input() lightId!: string;
}

export const ExposedLightComponent = exposeComponent(LightComponent, {
  name: 'light',
  description: 'Show a light to the user',
  props: {
    lightId: s.string('The id of the light'),
  },
});

// Expose a Card component
@Component({
  selector: 'app-card',
  template: `
    <div class="card">
      <h3>{{ title }}</h3>
      <div><ng-content></ng-content></div>
    </div>
  `,
})
export class CardComponent {
  @Input() title!: string;
}

export const ExposedCardComponent = exposeComponent(CardComponent, {
  name: 'card',
  description: 'Show a card to the user',
  props: {
    title: s.streaming.string('The title of the card'),
  },
  children: 'any',
});
```

### Step 2: Use `useUiChat` with Tools and Components

```ts
import { useUiChat } from '@hashbrownai/angular';
import {
  getUserTool,
  getLightsTool,
  controlLightTool,
} from './tools';
import {
  ExposedMarkdownComponent,
  ExposedLightComponent,
  ExposedCardComponent,
} from './exposed-components';

const chat = useUiChat({
  model: 'gpt-4.1',
  system:
    'You are a helpful assistant that can answer questions and help with tasks.',
  tools: [getUserTool, getLightsTool, controlLightTool],
  components: [
    ExposedMarkdownComponent,
    ExposedLightComponent,
    ExposedCardComponent,
  ],
});
```

### Step 3: Render Messages with UI

```html
<!-- messages.component.html -->
<div *ngFor="let message of chat.messages; let idx = index" [ngClass]="message.role">
  <ng-container *ngIf="message.ui; else textContent">
    <ng-container *ngTemplateOutlet="message.ui"></ng-container>
  </ng-container>
  <ng-template #textContent>
    <p>{{ message.content }}</p>
  </ng-template>
</div>
```

---

## 5. Putting It All Together: Full Chatbot Example

Below is a full example combining chat, tool calling, and generative UI.

```ts
// app.component.ts
import { Component } from '@angular/core';
import {
  useUiChat,
  useTool,
  exposeComponent,
} from '@hashbrownai/angular';
import { s } from '@hashbrownai/core';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent {
  input = '';

  // Define tools
  getUserTool = useTool({
    name: 'getUser',
    description: 'Get information about the current user',
    handler: () => ({ id: 'user-1', name: 'Alice' }),
  });
  getLightsTool = useTool({
    name: 'getLights',
    description: 'Get the current lights',
    handler: async () => [
      { id: 'light-1', brightness: 75 },
      { id: 'light-2', brightness: 50 },
    ],
  });
  controlLightTool = useTool({
    name: 'controlLight',
    description: 'Control a light',
    schema: s.object('Control light input', {
      lightId: s.string('The id of the light'),
      brightness: s.number('The brightness of the light'),
    }),
    handler: async (input) => {
      // update logic here
      return { success: true };
    },
  });

  // Expose components
  MarkdownComponent = exposeComponent(MarkdownComponent, {
    name: 'markdown',
    description: 'Show markdown to the user',
    props: {
      content: s.streaming.string('The markdown content'),
    },
  });
  LightComponent = exposeComponent(LightComponent, {
    name: 'light',
    description: 'Show a light to the user',
    props: {
      lightId: s.string('The id of the light'),
    },
  });
  CardComponent = exposeComponent(CardComponent, {
    name: 'card',
    description: 'Show a card to the user',
    props: {
      title: s.streaming.string('The title of the card'),
    },
    children: 'any',
  });

  chat = useUiChat({
    model: 'gpt-4.1',
    system:
      'You are a helpful assistant that can answer questions and help with tasks.',
    tools: [
      this.getUserTool,
      this.getLightsTool,
      this.controlLightTool,
    ],
    components: [
      this.MarkdownComponent,
      this.LightComponent,
      this.CardComponent,
    ],
  });

  handleSend() {
    if (this.input.trim()) {
      this.chat.sendMessage({ role: 'user', content: this.input });
      this.input = '';
    }
  }
}
```

```html
<!-- app.component.html -->
<hashbrown-provider [url]="'https://api.hashbrown.ai/v1'">
  <div class="messages">
    <div *ngFor="let message of chat.messages; let idx = index" [ngClass]="message.role">
      <ng-container *ngIf="message.ui; else textContent">
        <ng-container *ngTemplateOutlet="message.ui"></ng-container>
      </ng-container>
      <ng-template #textContent>
        <p>{{ message.content }}</p>
      </ng-template>
    </div>
  </div>
  <div class="composer">
    <input
      [(ngModel)]="input"
      name="chatInput"
      (keydown.enter)="handleSend()"
      placeholder="Type your message..."
      autocomplete="off"
    />
    <button (click)="handleSend()">Send</button>
  </div>
</hashbrown-provider>
```

---

## 6. Tips for Prompt Engineering and System Instructions

- Use the `system` prompt to set the assistant's role and rules. Be explicit about what the assistant can do, and provide examples if needed.
- For tool calling, describe each tool clearly and use Skillet schemas for arguments.
- For generative UI, expose only safe, well-documented components. Use schemas to describe props and children.
- Use the `debugName` option for easier debugging.

---

## 7. Next Steps

- [Learn more about Skillet schemas](../concept/schema.md)
- [Explore streaming and partial parsing](../concept/streaming.md)
- [See advanced prompt engineering](../guide/prompt-engineering.md)
- [Check out the sample smart home app](https://github.com/liveloveapp/hashbrown/tree/main/samples/smart-home/client-angular)

---

## Troubleshooting

- **No response from the assistant?** Check your API key and model configuration.
- **Tool not called?** Ensure the tool's name, description, and schema match the intended use.
- **UI not rendering?** Make sure your exposed components are included in the `components` array and their schemas match the props.

---

## Summary

With Hashbrown, you can build a chatbot that:

- Streams LLM responses in real time
- Lets the LLM call your backend functions
- Renders dynamic, LLM-driven Angular UI

This unlocks powerful, interactive AI experiences in your Angular apps.
