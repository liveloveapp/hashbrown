import { type ComponentType, type ReactElement } from 'react';
import styles from './ButtonGroup.module.css';

interface ButtonGroupProps {
  options: {
    label: string;
    value: string;
    icon?: ComponentType;
  }[];
  value?: string;
  onChange?: (value: string) => void;
}

export default function ButtonGroup({
  options,
  value,
  onChange,
}: ButtonGroupProps): ReactElement {
  return (
    <div className={styles.container}>
      {options.map((option) => {
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            className={`${styles.button} ${
              option.value === value ? styles.active : ''
            }`}
            onClick={() => onChange?.(option.value)}
          >
            {Icon && <Icon />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
