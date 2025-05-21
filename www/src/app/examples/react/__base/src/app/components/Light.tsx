import type { ReactElement } from 'react';
import type { Light } from '../models/light.model';
import { Card } from './Card';
import styles from './Light.module.css';

interface LightProps {
  light: Light;
  onChange: (id: string, changes: Partial<Light>) => void;
}

export function Light({ light, onChange }: LightProps): ReactElement {
  return (
    <div className={styles.container}>
      <Card title={light.name}>
        <div className={styles.light}>
          <div>{light.brightness}%</div>
        </div>
      </Card>
    </div>
  );
}
