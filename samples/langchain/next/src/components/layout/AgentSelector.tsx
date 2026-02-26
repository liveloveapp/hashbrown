import { AgentType } from '../../hooks/use-agent-type';
import styles from './AgentSelector.module.css';

const agentTypeLabels: Record<AgentType, string> = {
  langgraph: 'LangGraph SDK',
  copilotkit: 'CopilotKit',
};

export function AgentSelector({
  value,
  onChange,
}: {
  value: AgentType;
  onChange: (value: AgentType) => void;
}) {
  return (
    <div className={styles.agentSelector}>
      <label htmlFor="agentType">Agent runtime</label>
      <select
        id="agentType"
        value={value}
        onChange={(event) => onChange(event.target.value as AgentType)}
      >
        {Object.entries(agentTypeLabels).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}
