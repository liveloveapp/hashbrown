import { effect, Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class McpServerService {
  connected = signal(false);

  constructor() {
    effect(() => {
      this.connect().catch(console.error);
    });
  }

  async connect() {
    this.connected.set(true);
  }
}
