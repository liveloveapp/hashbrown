import { Component, computed, effect, inject, input } from '@angular/core';
import {
  AssistantMessageComponent,
  createTool,
  defineChatComponent,
  richChatResource,
} from '@hashbrownai/angular';
import { z } from 'zod';
import { OrdersService } from '../services/orders.service';

@Component({
  selector: 'app-order',
  template: `
    @if (order()) {
    <div class="mock-order">
      <h2>Order Details</h2>
      <p><strong>Order ID:</strong> {{ order()?.id }}</p>
      <p><strong>Product:</strong> {{ order()?.name }}</p>
      <p><strong>Purchased At:</strong> {{ order()?.purchasedAt }}</p>
    </div>
    }
  `,
  styles: [
    `
      .mock-order {
        border: 1px solid #ccc;
        border-radius: 8px;
        padding: 16px;
        max-width: 400px;
        margin: 16px 0;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        background-color: #f9f9f9;
      }
      .mock-order h2 {
        margin-top: 0;
        color: #333;
      }
      .mock-order p {
        margin: 8px 0;
        color: #555;
      }
      .mock-order strong {
        color: #000;
      }
    `,
  ],
})
export class OrderComponent {
  ordersService = inject(OrdersService);
  orderId = input.required<number>();
  order = computed(() => {
    return this.ordersService.getOrder(this.orderId());
  });
}

@Component({
  selector: 'app-rich-chat-page',
  template: `
    <div class="chat-messages">
      @for(message of chat.messages(); track $index) { @switch(message.role) {
      @case('user') {
      <p class="user-message">
        {{ message.content }}
      </p>
      } @case('assistant') {
      <lib-assistant-message
        [message]="message"
        [components]="components"
      ></lib-assistant-message>

      } @default {
      <!-- <p class="system-message">
        <strong>{{ message.role }}</strong>
        {{ message.content }}
      </p> -->
      } } } @if(chat.error()) {
      <p class="error-message">
        {{ chat.error() }}
      </p>
      }
    </div>
    <div class="chat-input">
      <textarea
        #textarea
        class="chat-input-textarea"
        placeholder="Type your message here..."
      ></textarea>
      <button (click)="sendMessage(textarea)">Send Message</button>
    </div>
  `,
  styles: `
    :host {
      display: grid;
      grid-template-rows: 1fr 120px;
      height: 100vh;
    }

    .chat-messages {
      overflow-y: auto;
      padding: 48px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      width: 100vw;
    }

    .user-message {
      align-self: flex-end;
      padding: 16px;
      background-color: #dedad9;
      max-width: 60%;
      border-radius: 2px;
    }

    .assistant-message {
      width: 100%;
      padding: 16px;
      justify-self: flex-start;
      border-radius: 2px;
    }

    .system-message {
      color: gray;
    }

    .chat-input {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
  `,
  imports: [AssistantMessageComponent],
})
export class RichChatPageComponent {
  chat = richChatResource({
    model: 'gpt-4o',
    messages: [],
    components: [
      defineChatComponent(
        'order',
        'Show the details of a specific order given an order id',
        OrderComponent,
        {
          orderId: z.number(),
        } as any
      ),
    ],
    tools: [
      createTool({
        name: 'getAllOrders',
        description: "Get a list of the user's recent orders",
        schema: z.object({}) as any,
        handler: async () => {
          const orders = inject(OrdersService);

          return orders.getOrders();
        },
      }),
    ],
  });

  constructor() {
    effect(() => {
      console.log(this.chat.messages());
    });
  }

  sendMessage(textarea: HTMLTextAreaElement) {
    this.chat.sendMessage({
      role: 'user',
      content: textarea.value,
    });
    textarea.value = '';
  }
  components = {
    order: OrderComponent,
  };
}
