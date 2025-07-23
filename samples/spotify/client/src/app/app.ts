import { Component, inject } from '@angular/core';
import { GameSetupComponent } from './game-setup/game-setup';
import { McpServerService } from './services/mcp-server';

@Component({
  imports: [GameSetupComponent],
  selector: 'spot-root',
  template: `
    @if (mcp.connected()) {
      <spot-game-setup></spot-game-setup>
    }
  `,
  styles: ``,
})
export class App {
  mcp = inject(McpServerService);

  constructor() {
    this.mcp.connect();
  }
}
