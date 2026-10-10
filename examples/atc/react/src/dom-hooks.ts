import { addsUserMessage, isEmptyChat, isNearBottom } from '@atc/shared';
import { type RefObject, useEffect, useRef } from 'react';

/**
 * Keeps a scroller pinned to its newest content while an answer streams. When
 * the user scrolls up it stops following, so they are never yanked back; their
 * own new message pins it again. Spread the result onto the scroller.
 */
export function useAutoScroll<T extends HTMLElement>(): {
  ref: RefObject<T | null>;
  onScroll: () => void;
} {
  const ref = useRef<T>(null);
  const pinned = useRef(true);

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const observer = new MutationObserver((records) => {
      if (records.some(addsUserMessage)) {
        pinned.current = true;
      }
      if (pinned.current && !isEmptyChat(element)) {
        element.scrollTop = element.scrollHeight;
      }
    });
    observer.observe(element, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => observer.disconnect();
  }, []);

  const onScroll = () => {
    if (ref.current) {
      pinned.current = isNearBottom(ref.current);
    }
  };

  return { ref, onScroll };
}

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
    const update = () =>
      element.style.setProperty(
        '--atc-kb',
        `${Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop))}px`,
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
