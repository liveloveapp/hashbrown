import {
  inject,
  Injectable,
  Injector,
  runInInjectionContext,
  signal,
} from '@angular/core';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SpotifyService } from './spotify';
import { Chat } from '@hashbrownai/core';
import { createTool } from '@hashbrownai/angular';

@Injectable({
  providedIn: 'root',
})
export class McpServerService {
  client?: Client;
  spotify = inject(SpotifyService);
  connected = signal(false);
  tools = signal<Chat.AnyTool[]>([]);
  injector = inject(Injector);

  async connect() {
    this.client = new Client({
      name: 'spotify',
      version: '1.0.0',
      title: 'Spotify',
    });

    await this.client.connect(
      new StreamableHTTPClientTransport(new URL('http://localhost:5150/mcp'), {
        requestInit: {
          headers: {
            Authorization: `Bearer ${encodeURIComponent(
              JSON.stringify(this.spotify.accessToken()),
            )}`,
          },
        },
      }),
    );

    const { tools: mcpTools } = await this.client.listTools();
    const tools = mcpTools.map((tool) => {
      return runInInjectionContext(this.injector, () => {
        return createTool({
          name: tool.name,
          description: tool.description ?? '',
          schema: {
            ...tool.inputSchema,
            additionalProperties: false,
            required: Object.keys(tool.inputSchema.properties ?? []),
          },
          handler: async (input) => {
            const result = await this.client?.callTool({
              name: tool.name,
              arguments: input,
            });
            return result;
          },
        });
      });
    });

    this.tools.set(tools);

    this.connected.set(true);
  }
}
