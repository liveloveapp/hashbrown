import {
  AnthropicIcon,
  BedrockIcon,
  GeminiIcon,
  OllamaIcon,
  OpenAiIcon,
} from './providers';
import styles from './WorksWith.module.css';

/** The strip of model providers Hashbrown works with. */
export function WorksWith() {
  return (
    <div className={styles.strip}>
      <span className={styles.provider}>
        <OpenAiIcon /> OpenAI
      </span>
      <span className={styles.provider}>
        <AnthropicIcon /> Anthropic
      </span>
      <span className={styles.provider}>
        <GeminiIcon /> Gemini
      </span>
      <span className={styles.provider}>
        <BedrockIcon /> Bedrock
      </span>
      <span className={styles.provider}>Azure</span>
      <span className={styles.provider}>
        <OllamaIcon /> Ollama
      </span>
      <span className={styles.provider}>Local models</span>
    </div>
  );
}
