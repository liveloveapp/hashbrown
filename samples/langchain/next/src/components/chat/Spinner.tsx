import RotateClockwise from '../icons/RotateClockwise';
import styles from './Spinner.module.css';

interface SpinnerProps {
  size?: number | string;
}

function Spinner({ size = 12 }: SpinnerProps) {
  return <RotateClockwise size={size} className={styles.spinner} />;
}

Spinner.displayName = 'Spinner';

export default Spinner;
