/** Identifies a checked parser client and its independently captured assets. */
export type ParserMode = 'json-parser-react' | 'json-parser-angular';

const modes: readonly ParserMode[] = [
  'json-parser-react',
  'json-parser-angular',
];

/** Selects requested parser recordings before any build or asset mutation. */
export function selectParserModes(requested?: string): ParserMode[] {
  if (requested === undefined) return [...modes];
  const selected = requested.split(',');
  if (selected.some((mode) => !modes.includes(mode as ParserMode)))
    throw new Error('Unknown docs parser mode');
  return modes.filter((mode) => selected.includes(mode));
}

/** Builds a browser entry that mounts the checked framework example. */
export function createParserEntry(mode: ParserMode, compiled: string): string {
  const path = (name: string) => JSON.stringify(`${compiled}/${name}`);
  return mode === 'json-parser-react'
    ? `import React from'react';import{createRoot}from'react-dom/client';import{JsonParserDemo}from${path('react/src/JsonParserDemo.js')};const root=createRoot(document.getElementById('root'));root.render(React.createElement(JsonParserDemo));window.__unmountParserDemo=()=>root.unmount();`
    : `import'@angular/compiler';import{bootstrapApplication}from'@angular/platform-browser';import{provideZonelessChangeDetection}from'@angular/core';import{JsonParserDemo}from${path('angular/src/app/json-parser-demo.js')};bootstrapApplication(JsonParserDemo,{providers:[provideZonelessChangeDetection()]}).then(app=>{window.__unmountParserDemo=()=>app.destroy()}).catch(console.error);`;
}

/** Describes the actual framework capture and its local fixture boundary. */
export function createParserTranscript(mode: ParserMode): string {
  const framework = mode === 'json-parser-react' ? 'React' : 'Angular';
  return `${mode}\n\nRecorded through the checked ${framework} component after both React and Angular passed browser behavior checks. The real public parser consumes a finite local JSON stream; no weather API, no live model and no narration. Presentation styles are added.\n\nThe first two seconds preview the final result. The complete interaction follows. Start stream to inspect accumulated JSON beside the preview. The ordinary city string waits for its closing quote. The streaming forecast grows before its closing quote. An alert appears once its required field values are complete, even before its closing brace arrives. This does not establish a complete JSON document. Partial values do not establish a complete valid document. Completion requires source EOF, parser completion and final JSON/schema validation.\n\nChoose Stop during a stream. The preview stops changing. Choose Reset to discard the previous source and values, then Start stream to recover. A second Start stream replaces the active source. The recording ends on a complete valid document. Malformed JSON, schema-invalid values, incomplete documents, cancellation, replacement, reset and component cleanup are checked separately in both frameworks. State clears on refresh.\n`;
}
