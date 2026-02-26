import Image from 'next/image';
import styles from './header.module.css';
import { AgentSelector } from './AgentSelector';
import { useAgentType } from '../../hooks/use-agent-type';

export default function Header() {
  const { agentType, setAgentType } = useAgentType();

  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <a href="https://hashbrown.dev" target="_blank">
          <Image src="/brand-mark.svg" alt="Hashbrown" height={32} width={34} />
        </a>
        <h1>Pilot Agent</h1>
      </div>
      <AgentSelector value={agentType} onChange={setAgentType} />
    </header>
  );
}
