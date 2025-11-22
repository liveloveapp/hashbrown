import { type ComponentProps, forwardRef } from 'react';
import styles from './Textarea.module.css';

const Textarea = forwardRef<HTMLTextAreaElement, ComponentProps<'textarea'>>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={`${styles.textarea} ${className || ''}`.trim()}
        ref={ref}
        {...props}
      />
    );
  },
);

Textarea.displayName = 'Textarea';

export { Textarea };
