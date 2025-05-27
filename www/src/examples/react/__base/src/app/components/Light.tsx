import type { ChangeEvent, ReactElement } from 'react';
import type { Light } from '../models/light.model';
import Card from './Card';
import styles from './Light.module.css';
import { useSmartHomeStore } from '../store/smart-home.store';
import Slider from './Slider';

interface LightProps {
  lightId: string;
}

export default function Light({ lightId }: LightProps): ReactElement {
  const light = useSmartHomeStore((state) =>
    state.lights.find((l) => l.id === lightId),
  );

  const updateLight = useSmartHomeStore((state) => state.updateLight);

  const handleBrightnessChange = (e: ChangeEvent<HTMLInputElement>) => {
    updateLight(lightId, { brightness: Number(e.target.value) });
  };

  if (!light) {
    return <div>Light not found</div>;
  }

  return (
    <div className={styles.container}>
      <Card title={light.name}>
        <div className={styles.light}>
          <Slider
            className="w-full"
            max={100}
            step={1}
            value={light.brightness}
            onChange={handleBrightnessChange}
          />
        </div>
      </Card>
    </div>
  );
}
