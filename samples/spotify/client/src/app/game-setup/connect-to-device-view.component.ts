import { Component, inject, input } from '@angular/core';
import { ChatService } from '../services/chat';

@Component({
  imports: [],
  selector: 'spot-connect-to-device-view',
  template: `
    <div>
      <h1>Connect to Device</h1>

      <ul>
        @for (device of devices(); track device.deviceId) {
          <li>
            <button (click)="connect(device.deviceId)">
              {{ device.name }}
            </button>
          </li>
        }
      </ul>
    </div>
  `,
  styles: ``,
})
export class ConnectToDeviceViewComponent {
  devices = input.required<{ deviceId: string; name: string }[]>();
  chat = inject(ChatService);

  connect(deviceId: string) {
    this.chat.sendMessage(`connect_to_device: ${deviceId}`);
  }
}
