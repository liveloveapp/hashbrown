import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import styles from './AiToastNotification.module.css';

type ToastType = 'refusal' | 'success' | 'info';

interface AiToastNotificationProps {
  title: string;
  message: string;
  type: ToastType;
}

const CLOSE_ANIMATION_DURATION = 300;

export const AiToastNotification = ({
  title,
  message,
  type,
}: AiToastNotificationProps) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const messageContainerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [status, setStatus] = useState<'open' | 'closing' | 'closed'>('open');

  const segments = useMemo(() => {
    if (
      typeof window === 'undefined' ||
      typeof Intl === 'undefined' ||
      !(Intl as unknown as { Segmenter?: unknown }).Segmenter ||
      typeof navigator === 'undefined'
    ) {
      return message.split(/(\s+)/);
    }

    const segmenter = new Intl.Segmenter(navigator.language, {
      granularity: 'word',
    });
    return Array.from(segmenter.segment(message)).map((segment) => segment.segment);
  }, [message]);

  useEffect(() => {
    const root = rootRef.current;
    const messageContainer = messageContainerRef.current;
    const measure = measureRef.current;

    if (!root || !messageContainer || !measure) {
      return;
    }

    if (typeof window === 'undefined') {
      setLines([message]);
      return;
    }

    const computedStyle = window.getComputedStyle(messageContainer);
    measure.style.font = `${computedStyle.fontWeight} ${computedStyle.fontSize} ${computedStyle.fontFamily}`;

    const maxWidth = messageContainer.clientWidth || 0;
    const calculatedLines: string[] = [];

    let currentLine = '';
    for (const segment of segments) {
      const candidate = currentLine + segment;
      measure.textContent = candidate;
      const width = measure.offsetWidth;
      if (width <= maxWidth || currentLine.length === 0) {
        currentLine = candidate;
      } else {
        calculatedLines.push(currentLine);
        currentLine = segment.trimStart();
      }
    }

    if (currentLine) {
      calculatedLines.push(currentLine);
    }

    setLines(calculatedLines.length > 0 ? calculatedLines : [message]);

    requestAnimationFrame(() => {
      const content = contentRef.current;
      if (!content || typeof window === 'undefined') return;

      const rootStyles = window.getComputedStyle(root);
      const verticalPadding =
        parseFloat(rootStyles.paddingTop) + parseFloat(rootStyles.paddingBottom);
      root.style.height = `${content.scrollHeight + verticalPadding}px`;
    });
  }, [message, segments]);

  const handleClose = () => {
    if (status !== 'open') return;
    setStatus('closing');
    setTimeout(() => {
      setStatus('closed');
    }, CLOSE_ANIMATION_DURATION);
  };

  const rootClassName = clsx(
    styles.root,
    styles[type],
    status === 'closing' && styles.closing,
    status === 'closed' && styles.closed,
  );

  if (status === 'closed') {
    return null;
  }

  return (
    <div ref={rootRef} className={rootClassName} data-toast-type={type}>
      <div ref={contentRef} className={styles.content}>
        <div className={styles.title}>
          <span className={styles.titleText}>{title}</span>
          <button type="button" className={styles.iconButton} onClick={handleClose}>
            <span className={clsx('material-symbols-outlined', styles.icon)}>close</span>
          </button>
        </div>
        <div ref={messageContainerRef} className={styles.message}>
          {lines.map((line, index) => (
            <span key={index} className={styles.line}>
              {line}
            </span>
          ))}
        </div>
        <div ref={measureRef} className={styles.measure} />
      </div>
    </div>
  );
};
