import {
  type ChangeEventHandler,
  forwardRef,
  type InputHTMLAttributes,
} from 'react';
import styles from './Slider.module.css';

interface SliderProps extends InputHTMLAttributes<HTMLInputElement> {
  value: number;
  onChange?: ChangeEventHandler<HTMLInputElement>;
}

const Slider = forwardRef<HTMLInputElement, SliderProps>(
  ({ value, onChange, ...props }, ref) => {
    return (
      <input
        ref={ref}
        type="range"
        min="0"
        max="100"
        value={value}
        onChange={onChange}
        className={styles.input}
        {...props}
      />
    );
  },
);

Slider.displayName = 'Slider';

export default Slider;
