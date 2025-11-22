'use client';

import Image from 'next/image';
import { useCallback, useState } from 'react';
import { useLangGraphPlanAgent } from '../../agents/langgraph-plan-agent';
import { Button } from '../../components/Button';
import { Textarea } from '../../components/Textarea';
import { UiChat } from '../../components/chat/Messages';
import { useAgentType } from '../../hooks/use-agent-type';
import { AgentSelector } from '../../components/layout/AgentSelector';
import styles from '../page.module.css';

type PlanAgentResult = ReturnType<typeof useLangGraphPlanAgent>;
type PlanAgent = PlanAgentResult['agent'];

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

function PlanAgentContent({ agent }: { agent: PlanAgent }) {
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
            initialValue="Weather at KBDN"
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

function LangGraphPlanAgentContent() {
  const { agent } = useLangGraphPlanAgent();
  return <PlanAgentContent agent={agent} />;
}

export default function LangGraphPage() {
  const { agentType, setAgentType } = useAgentType();

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
        <AgentSelector value={agentType} onChange={setAgentType} />
      </header>
      <main className={styles.main}>
        <LangGraphPlanAgentContent />
      </main>
    </>
  );
}
