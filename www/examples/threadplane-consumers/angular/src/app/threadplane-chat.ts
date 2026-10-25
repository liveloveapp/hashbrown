import { ChangeDetectionStrategy, Component } from '@angular/core';
import { injectAgent, provideAgent } from '@threadplane/ag-ui';
import { ChatComponent } from '@threadplane/chat';

/** Hosts a Threadplane conversation backed by the Hashbrown server. */
@Component({
  selector: 'app-threadplane-chat',
  imports: [ChatComponent],
  providers: [provideAgent({ url: '/api/chat' })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main>
      <h1>Ask a product question</h1>
      <chat [agent]="agent" />
    </main>
  `,
  styles: `
    :host {
      display: block;
    }
    chat {
      height: min(42rem, 85dvh);
    }
  `,
})
export class ThreadplaneChat {
  protected readonly agent = injectAgent();
}
