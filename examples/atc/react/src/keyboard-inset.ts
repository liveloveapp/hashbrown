import { keyboardInset } from '@atc/shared';
import { type RefObject, useEffect } from 'react';

/**
 * Publishes the on-screen keyboard's height as `--atc-kb` on `ref`'s element,
 * from `visualViewport`, so the phone sheet can sit above it (iOS Safari does
 * not resize the layout viewport). A no-op where `visualViewport` is missing.
 */
export function useKeyboardInset(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const element = ref.current;
    const viewport = window.visualViewport;
    if (!element || !viewport) {
      return;
    }
    // Set on the element, not through state, so viewport scrolls don't
    // re-render the app.
    const update = () =>
      element.style.setProperty(
        '--atc-kb',
        keyboardInset(viewport, window.innerHeight),
      );
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    update();

    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    };
  }, [ref]);
}
