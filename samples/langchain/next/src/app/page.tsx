'use client';

import Image from 'next/image';
import { useCallback, useState } from 'react';
import { usePlanAgent } from '../agents/plan-agent';
import { Button } from '../components/button';
import { Textarea } from '../components/textarea';
import { UiChat } from '../components/ui-chat';
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

export default function Index() {
  const { agent } = usePlanAgent();

  const handleSubmit = useCallback(
    (value: string) => {
      agent.sendMessage({ role: 'user', content: value });
    },
    [agent],
  );

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
      </main>
    </>
  );
}
