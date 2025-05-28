import {
  type ChangeEvent,
  type ReactElement,
  useCallback,
  useMemo,
} from 'react';
import BrandGoogle from '../icons/BrandGoogle';
import BrandOpenAi from '../icons/BrandOpenAi';
import BrandWriter from '../icons/BrandWriter';
import { useConfigStore } from '../store/config.store';
import ButtonGroup from './ButtonGroup';
import styles from './Config.module.css';

export default function Config(): ReactElement {
  const provider = useConfigStore((state) => state.provider);
  const apiKey = useConfigStore((state) => state.apiKey);
  const setProvider = useConfigStore((state) => state.setProvider);
  const setApiKey = useConfigStore((state) => state.setApiKey);

  const handleProviderChange = useCallback(
    (value: string) => {
      setProvider(value);
    },
    [setProvider],
  );

  const handleApiKeyChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      setApiKey(e.target.value);
    },
    [setApiKey],
  );

  const providers = useMemo(
    () => [
      {
        label: 'OpenAI',
        value: 'openai',
        icon: BrandOpenAi,
      },
      {
        label: 'Google',
        value: 'google',
        icon: BrandGoogle,
      },
      {
        label: 'Writer',
        value: 'writer',
        icon: BrandWriter,
      },
    ],
    [],
  );

  return (
    <div className={styles.container}>
      <form className={styles.form}>
        <input
          type="password"
          placeholder="API Key"
          value={apiKey}
          onChange={handleApiKeyChange}
        />
      </form>
      <div>
        <ButtonGroup
          options={providers}
          value={provider}
          onChange={handleProviderChange}
        />
      </div>
    </div>
  );
}
