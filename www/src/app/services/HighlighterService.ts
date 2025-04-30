import { Injectable } from '@angular/core';
import { createHighlighter, HighlighterGeneric } from 'shiki';

@Injectable({
  providedIn: 'root',
})
export class HighlighterService {
  highlighter: HighlighterGeneric<any, any> | undefined;

  async loadHighlighter() {
    this.highlighter = await createHighlighter({
      themes: ['github-dark'],
      langs: ['typescript'],
    });
    await this.highlighter.loadTheme('github-dark');
  }

  getHighlighter() {
    if (!this.highlighter) {
      throw new Error('Highlighter not loaded. Call loadHighlighter() first.');
    }
    return this.highlighter;
  }
}
