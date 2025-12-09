import { s } from '@hashbrownai/core';
import { exposeComponent } from '@hashbrownai/react';
import MagicTextRenderer from '../components/chat/MagicTextRenderer';
import styles from './Heading.module.css';

type HeadingProps = {
  text: string;
  level: number | null;
};

function clampLevel(level: number | null): 1 | 2 | 3 | 4 | 5 | 6 {
  const numericLevel =
    typeof level === 'number' && Number.isFinite(level) ? Math.round(level) : 2;
  const clamped = Math.min(6, Math.max(1, numericLevel)) as
    | 1
    | 2
    | 3
    | 4
    | 5
    | 6;
  return clamped;
}

function Heading({ text, level }: HeadingProps) {
  const headingLevel = clampLevel(level);
  const Tag = `h${headingLevel}` as keyof JSX.IntrinsicElements;

  return (
    <div className={styles.wrapper}>
      <Tag className={`${styles.heading} ${styles[`h${headingLevel}`]}`}>
        <MagicTextRenderer text={text} />
      </Tag>
    </div>
  );
}

Heading.displayName = 'Heading';

const exposedHeading = exposeComponent(Heading, {
  name: 'h',
  description: 'Show a heading to separate sections with configurable level',
  props: {
    text: s.streaming.string('The text to show in the heading'),
    level: s.anyOf([
      s.nullish(),
      s.number('Heading level from 1 (largest) to 6 (smallest); defaults to 2'),
    ]),
  },
});

export default Heading;
export { exposedHeading };
