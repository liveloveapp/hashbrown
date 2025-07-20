import {
  Component,
  inject,
  Injector,
  runInInjectionContext,
  signal,
} from '@angular/core';
import { createTool } from '@hashbrownai/angular';
import { Chat } from '@hashbrownai/core';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { ProjectChatComponent } from './project-chat';

@Component({
  selector: 'app-projects',
  template: `
    @let resolvedTools = tools();
    @if (resolvedTools) {
      <app-project-chat [tools]="resolvedTools" />
    }
  `,
  imports: [ProjectChatComponent],
})
export class ProjectsComponent {
  client = new Client({
    name: 'nx-mcp-client',
    version: '1.0.0',
  });
  tools = signal<null | Chat.AnyTool[]>(null);
  injector = inject(Injector);

  constructor() {
    this.connectToServer();
  }

  async connectToServer() {
    const transport = new SSEClientTransport(
      new URL('http://localhost:4600/sse'),
    );

    await this.client.connect(transport);

    const mcpTools = await this.client.listTools();

    const tools = mcpTools.tools.map((tool) => {
      return runInInjectionContext(this.injector, () =>
        createTool({
          name: tool.name,
          description: tool.description ?? '',
          schema: {
            ...tool.inputSchema,
            additionalProperties: false,
            required: Object.keys(tool.inputSchema.properties ?? {}),
          },
          handler: async (input) => {
            const result = await this.client.callTool({
              name: tool.name,
              arguments: input,
            });
            return result;
          },
        }),
      );
    });

    this.tools.set(tools);
  }
}
