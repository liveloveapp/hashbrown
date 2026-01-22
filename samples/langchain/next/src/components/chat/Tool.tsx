import { ToolCallStatus } from '@copilotkitnext/core';
import SquareRoundedCheck from '../icons/SquareRoundedCheck';
import Spinner from './Spinner';
import styles from './Tool.module.css';

interface ToolProps {
  params: {
    name: string;
    status: ToolCallStatus;
  };
  stepText?: string;
}

function Tool({ params, stepText }: ToolProps) {
  const displayText =
    stepText &&
    (params.status === ToolCallStatus.InProgress ||
      params.status === ToolCallStatus.Executing)
      ? stepText
      : params.name;

  return (
    <div className={styles.tool}>
      {(params.status === ToolCallStatus.InProgress ||
        params.status === ToolCallStatus.Executing) && (
        <div className={styles.toolInProgress}>
          <Spinner size={16} />
          <span className={stepText ? styles.stepText : undefined}>
            {displayText}
          </span>
        </div>
      )}
      {params.status === ToolCallStatus.Complete && (
        <div className={styles.toolComplete}>
          <SquareRoundedCheck size={16} />
          {params.name}
        </div>
      )}
    </div>
  );
}

Tool.displayName = 'Tool';

export default Tool;
