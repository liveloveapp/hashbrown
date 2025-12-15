import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  cloneElement,
  type KeyboardEvent,
} from 'react';
import { Chart as ChartJS } from 'chart.js/auto';
import styles from './ChartPage.module.css';
import { useFinanceChat } from './useFinanceChat';
import { CodeLoader } from './CodeLoader';
import { ChartExamples, type ChartPrompt } from './ChartExamples';
import { CodeModal } from './CodeModal';

export const ChartPage = () => {
  const { chart, code, isLoading, isEmpty, lastAssistantMessage, sendMessage } =
    useFinanceChat();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartInstanceRef = useRef<ChartJS | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [hasRenderedAChart, setHasRenderedAChart] = useState(false);
  const [isCodeModalOpen, setIsCodeModalOpen] = useState(false);

  const placeholder = useMemo(() => {
    return lastAssistantMessage ? 'What do you want to change?' : 'What chart do you want to create?';
  }, [lastAssistantMessage]);

  useEffect(() => {
    if (!isLoading) {
      const input = inputRef.current;
      if (input) {
        input.focus();
        input.value = '';
      }
    }
  }, [isLoading]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;
    const timer = window.setTimeout(() => {
      if (disposed) return;

      canvas.classList.remove(styles.canvasRendering);

      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
        chartInstanceRef.current = null;
      }

      if (chart) {
        const interaction = chart.options.interaction;
        const options = {
          responsive: true,
          maintainAspectRatio: true,
          borderColor: 'rgba(0, 0, 0, 0.1)',
          ...chart.options,
          interaction: interaction
            ? {
                ...interaction,
                mode: interaction.mode ?? undefined,
                axis: interaction.axis ?? undefined,
                intersect: interaction.intersect ?? undefined,
              }
            : undefined,
        } as ChartJS['options'];

        chartInstanceRef.current = new ChartJS(canvas, {
          ...chart.chart,
          options,
        });

        setHasRenderedAChart(true);
      }
    }, 300);

    canvas.classList.add(styles.canvasRendering);

    return () => {
      disposed = true;
      window.clearTimeout(timer);
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
        chartInstanceRef.current = null;
      }
      canvas.classList.remove(styles.canvasRendering);
    };
  }, [chart]);

  const submitMessage = useCallback(
    (value?: string) => {
      const input = inputRef.current;
      const content = value ?? input?.value ?? '';

      if (!content.trim()) {
        return;
      }

      if (input) {
        input.value = content;
      }

      sendMessage(content);
    },
    [sendMessage],
  );

  const onInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        submitMessage();
      }
    },
    [submitMessage],
  );

  const onExampleSelect = useCallback(
    (example: ChartPrompt) => {
      submitMessage(example.prompt);
    },
    [submitMessage],
  );

  const onOpenCodeModal = useCallback(() => {
    setIsCodeModalOpen(true);
  }, []);

  const onCloseCodeModal = useCallback(() => {
    setIsCodeModalOpen(false);
  }, []);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <input
          ref={inputRef}
          className={styles.input}
          type="text"
          placeholder={placeholder}
          disabled={isLoading}
          onKeyDown={onInputKeyDown}
        />
        <button
          className={styles.sendButton}
          type="button"
          onClick={() => submitMessage()}
          disabled={isLoading}
        >
          {lastAssistantMessage ? 'Remix' : 'Create'}
        </button>
      </header>
      <div className={styles.loaderArea}>
        {isLoading && (
          <div className={styles.progressBar}>
            <div className={styles.progressIndicator} />
          </div>
        )}
      </div>
      <div className={styles.chartArea}>
        {isEmpty && <ChartExamples onSelect={onExampleSelect} />}
        {code && !hasRenderedAChart && <CodeLoader code={code} />}
        <canvas ref={canvasRef} className={styles.canvas} />
      </div>
      <div className={styles.toastArea}>
        {lastAssistantMessage?.ui?.map((element, index) =>
          cloneElement(element, { key: index }),
        )}
      </div>
      {code && (
        <button type="button" className={styles.codeButton} onClick={onOpenCodeModal}>
          Code
        </button>
      )}
      {isCodeModalOpen && code && <CodeModal code={code} onClose={onCloseCodeModal} />}
    </div>
  );
};
