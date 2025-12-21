import { Injectable } from '@angular/core';
import { HighlighterGeneric } from 'shiki';

@Injectable({
  providedIn: 'root',
})
export class HighlighterService {
  highlighter: HighlighterGeneric<any, any> | undefined =
    this.createPlainHighlighter();

  loadHighlighter(): void {
    this.highlighter = this.createPlainHighlighter();
  }

  getHighlighter() {
    this.highlighter ??= this.createPlainHighlighter();
    return this.highlighter;
  }

  private createPlainHighlighter(): HighlighterGeneric<any, any> {
    const escape = (value: string) =>
      value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    return {
      codeToHtml: (code: string, options?: { lang?: string }) => {
        const lang = options?.lang ?? 'text';
        const langClass = `language-${lang}`;
        return `<pre class="${langClass}"><code class="${langClass}">${escape(code)}</code></pre>`;
      },
    } as unknown as HighlighterGeneric<any, any>;
  }
}
