import { Component } from '@angular/core';
import { LpdWindow } from './LpdWindow';
import { CodeHighlight } from '../../pipes/CodeHighlight';

const VIBE_CODE_SAMPLE = `
const environment = defineEnvironment({
  functions: [
    defineFunction({
      name: 'createLight',
      input: s.string('Name of the light'),
      output: s.object('Light object', {
        id: s.string('ID of the light'),
        name: s.string('Name of the light'),
        brightness: s.number('Brightness'),
      }),
      handler:  (input) => {
        return smartHome.createLight(input);
      },
    }),
  ],
});

await environment.run(\`
  const light = await createLight(
    'Living Room - Corner Lamp'
  );
\`);
`;

@Component({
  selector: 'www-ldp-vibe-code',
  imports: [LpdWindow, CodeHighlight],
  template: `
    <www-lpd-window title="Vibe Code">
      <div class="code" [innerHTML]="code | codeHighlight"></div>
    </www-lpd-window>
  `,
  styles: `
    .code {
      background-color: #3d3c3a;
      font-size: 12px;
      padding: 16px;
    }
  `,
})
export class LdpVibeCode {
  code = VIBE_CODE_SAMPLE.trim();
}
