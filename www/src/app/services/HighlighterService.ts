import { Injectable } from '@angular/core';
import { createHighlighter, HighlighterGeneric } from 'shiki';
import shikiHashbrown from '../themes/shiki-hashbrown';

@Injectable({
  providedIn: 'root',
})
export class HighlighterService {
  highlighter: HighlighterGeneric<any, any> | undefined;

  async loadHighlighter() {
    this.highlighter = await createHighlighter({
      themes: [shikiHashbrown as any],
      langs: ['typescript'],
    });
  }

  getHighlighter() {
    if (!this.highlighter) {
      throw new Error('Highlighter not loaded. Call loadHighlighter() first.');
    }
    return this.highlighter;
  }
}
