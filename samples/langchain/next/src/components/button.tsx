import { type ComponentProps, forwardRef } from 'react';
import styles from './button.module.css';

type ButtonVariant =
  | 'default'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'destructive';
type ButtonSize = 'default' | 'sm' | 'lg' | 'icon';

interface ButtonProps extends ComponentProps<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const getButtonClassName = ({
  variant = 'default',
  size = 'default',
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}): string => {
  const baseClass = styles.button;
  const variantMap = {
    default: styles.buttonDefault,
    secondary: styles.buttonSecondary,
    outline: styles.buttonOutline,
    ghost: styles.buttonGhost,
    destructive: styles.buttonDestructive,
  };
  const variantClass = variantMap[variant];
  const sizeMap = {
    default: styles.buttonDefaultSize,
    sm: styles.buttonSm,
    lg: styles.buttonLg,
    icon: styles.buttonIcon,
  };
  const sizeClass = sizeMap[size];

  const classes = [baseClass, variantClass, sizeClass];
  if (className) {
    classes.push(className);
  }

  return classes.filter(Boolean).join(' ');
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant, size, className, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={getButtonClassName({ variant, size, className })}
        {...props}
      />
    );
  },
);

Button.displayName = 'Button';

export { Button, type ButtonProps, type ButtonVariant, type ButtonSize };
