import { type ComponentProps, forwardRef } from 'react';
import styles from './input.module.css';

const Input = forwardRef<HTMLInputElement, ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={`${styles.input} ${className || ''}`.trim()}
        ref={ref}
        {...props}
      />
    );
  },
);

Input.displayName = 'Input';

export { Input };
