import { Component, input, output, signal, Type } from '@angular/core';
import { BrandGoogleComponent } from '../icons/brand-google.component';
import { BrandOpenAiComponent } from '../icons/brand-openai.component';
import { BrandWriterComponent } from '../icons/brand-writer.component';
import { ButtonGroupComponent } from './button-group.component';

@Component({
  selector: 'app-config',
  imports: [ButtonGroupComponent],
  template: `
    <form>
      <input
        type="password"
        placeholder="API Key"
        (change)="onApiKeyChange($event)"
      />
    </form>
    <div class="providers">
      <app-button-group
        [options]="providers()"
        [value]="provider()"
        (valueChange)="onProviderChange($event)"
      />
    </div>
  `,
  styles: `
    :host {
      display: flex;
      justify-content: space-between;
      border-radius: 12px;
    }

    form {
      display: flex;
      flex-direction: column;
      gap: 8px;

      > input {
        background-color: transparent;
        font-size: 14px;
        padding: 11px;
        width: 100%;
        border: 1px solid rgba(61, 60, 58, 0.24);
        border-radius: 8px;
      }
    }
  `,
})
export class ConfigComponent {
  providers = signal<{ label: string; value: string; icon?: Type<any> }[]>([
    {
      label: 'OpenAI',
      value: 'openai',
      icon: BrandOpenAiComponent,
    },
    {
      label: 'Google',
      value: 'google',
      icon: BrandGoogleComponent,
    },
    {
      label: 'Writer',
      value: 'writer',
      icon: BrandWriterComponent,
    },
  ]);
  provider = input.required<string>();
  apiKeyChange = output<string>();
  providerChange = output<string>();

  onApiKeyChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    const apiKey = target.value;
    this.apiKeyChange.emit(apiKey);
  }

  onProviderChange(value: string): void {
    this.providerChange.emit(value);
  }
}
