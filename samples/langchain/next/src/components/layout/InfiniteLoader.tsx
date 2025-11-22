import Radar from '../icons/Radar';
import styles from './InfiniteLoader.module.css';

function InfiniteLoader() {
  return (
    <div className={styles.container}>
      <Radar size={180} className={styles.radar} />
    </div>
  );
}

InfiniteLoader.displayName = 'InfiniteLoader';

export default InfiniteLoader;
