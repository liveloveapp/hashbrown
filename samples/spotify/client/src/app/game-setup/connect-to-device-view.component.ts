import { Component, inject, input } from '@angular/core';
import { ChatService } from '../services/chat';

@Component({
  imports: [],
  selector: 'spot-connect-to-device-view',
  template: `
    @if (devices().length > 0) {
      <h1>Pick a Device</h1>
      @for (device of devices(); track device.deviceId) {
        <button (click)="connect(device.deviceId)">
          <span class="material-symbols-outlined">
            {{ device.materialSymbolIcon }}
          </span>
          <span class="device-name">
            {{ device.name }}
          </span>
        </button>
      }
    } @else {
      <div class="no-devices">
        <h1>No devices found</h1>
        <p>Please open up spotify and try again.</p>
        <button (click)="chat.sendMessage('retry')">Retry</button>
      </div>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: 100vw;
      height: 100vh;
      align-items: center;
      justify-content: center;
      padding: 32px;
    }

    button {
      display: grid;
      grid-template-columns: 32px 1fr;
      grid-template-rows: 32px;
      gap: 8px;
      border: none;
      outline: none;
      padding: 8px 16px;
      border-radius: 4px;
      color: white;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease-in-out;
      width: 100%;
      align-items: center;
      justify-content: center;
    }

    .device-name {
      font-size: 16px;
      font-weight: 600;
      text-align: left;
    }

    button:nth-child(1) {
      background-color: var(--sunshine-yellow);
    }

    button:nth-child(2) {
      background-color: var(--sky-blue);
    }

    button:nth-child(3) {
      background-color: var(--sunset-orange);
    }

    button:nth-child(4) {
      background-color: var(--olive-green);
    }

    button:nth-child(5) {
      background-color: var(--indian-red);
    }
  `,
})
export class ConnectToDeviceViewComponent {
  devices =
    input.required<
      { deviceId: string; name: string; materialSymbolIcon: string }[]
    >();
  chat = inject(ChatService);

  connect(deviceId: string) {
    this.chat.sendMessage(`connect_to_device: ${deviceId}`);
  }
}
