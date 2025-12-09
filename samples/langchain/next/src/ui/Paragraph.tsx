import { s } from '@hashbrownai/core';
import { exposeComponent } from '@hashbrownai/react';
import MagicTextRenderer from '../components/chat/MagicTextRenderer';
import styles from './Paragraph.module.css';

type ParagraphProps = {
  text: string;
  citations: Array<{ id: number; url: string }> | null;
};

function Paragraph({ text }: ParagraphProps) {
  return (
    <div className={styles.wrapper}>
      <p className={styles.paragraph} data-raw-text={text}>
        <MagicTextRenderer text={text} />
      </p>
    </div>
  );
}

Paragraph.displayName = 'Paragraph';

const exposedParagraph = exposeComponent(Paragraph, {
  name: 'p',
  description: 'Display a paragraph of text',
  props: {
    text: s.streaming.string('The paragraph text content'),
    citations: s.anyOf([
      s.nullish(),
      s.array(
        'Citation references for the paragraph',
        s.object('A citation reference', {
          id: s.number('The identifier of the citation'),
          url: s.string('The URL of the citation'),
        }),
      ),
    ]),
  },
});

export default Paragraph;
export { exposedParagraph };
