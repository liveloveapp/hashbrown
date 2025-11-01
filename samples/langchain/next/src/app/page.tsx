'use client';

import Image from 'next/image';
import { type ReactNode, useCallback, useState } from 'react';
import { usePlanAgent } from '../agents/plan-agent';
import { Button } from '../components/button';
import { Textarea } from '../components/textarea';
import { UiChat } from '../components/ui-chat';
import { useAssistant } from '../hooks/use-assistant';
import styles from './page.module.css';

interface ChatInputProps {
  placeholder?: string;
  initialValue?: string;
  onSubmit?: (value: string) => void;
}

function ChatInput({
  placeholder,
  initialValue = '',
  onSubmit,
}: ChatInputProps) {
  const [value, setValue] = useState(initialValue);

  const handleSubmit = () => {
    if (value.trim() && onSubmit) {
      onSubmit(value);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <>
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
      />
      <Button onClick={handleSubmit}>Submit</Button>
    </>
  );
}

function PlanAgentContent({
  assistantId,
  apiUrl,
}: {
  assistantId: string;
  apiUrl: string;
}) {
  const { agent } = usePlanAgent({ assistantId, apiUrl });

  const handleSubmit = useCallback(
    (value: string) => {
      agent.sendMessage({ role: 'user', content: value });
    },
    [agent],
  );

  return (
    <>
      <section className={styles.input}>
        <div className={styles.prompt}>
          <ChatInput
            initialValue="Provide a flight plan from KBDN and landing at KPDX for the current weather conditions."
            placeholder="I am a pilot agent and expert flight planner. How can I help you?"
            onSubmit={handleSubmit}
          />
        </div>
      </section>
      <section className={styles.output}>
        <UiChat message={agent.lastAssistantMessage} onRetry={agent.reload} />
      </section>
    </>
  );
}

export default function Index() {
  const { assistantId, isLoading, error, apiUrl } = useAssistant();

  return (
    <>
      <header className={styles.header}>
        <div className={styles.brand}>
          <a href="https://hashbrown.dev" target="_blank">
            <Image
              src="/brand-mark.svg"
              alt="Hashbrown"
              height={32}
              width={34}
            />
          </a>
          <h1>Pilot Agent</h1>
        </div>
      </header>
      <main className={styles.main}>
        {error ? (
          <div className={styles.status}>{error}</div>
        ) : !assistantId ? (
          <div className={styles.status}>
            {isLoading ? 'Loading assistant...' : 'Assistant unavailable.'}
          </div>
        ) : (
          <PlanAgentContent assistantId={assistantId} apiUrl={apiUrl} />
        )}
      </main>
    </>
  );
}
