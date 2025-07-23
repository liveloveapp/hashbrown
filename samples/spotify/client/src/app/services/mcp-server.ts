import { effect, Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class McpServerService {
  constructor() {
    effect(() => {
      this.connect().catch(console.error);
    });
  }

  async connect() {
    // todo: connect to mcp server
  }
}
