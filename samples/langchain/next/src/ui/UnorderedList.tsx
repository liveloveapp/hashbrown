import { s } from '@hashbrownai/core';
import { exposeComponent } from '@hashbrownai/react';
import MagicTextRenderer from '../components/chat/MagicTextRenderer';
import styles from './UnorderedList.module.css';

type UnorderedListProps = {
  items: string[];
  citations: Array<{ id: number; url: string }> | null;
};

function UnorderedList({ items }: UnorderedListProps) {
  return (
    <div className={styles.wrapper}>
      <ul className={styles.list}>
        {items.map((text, index) => (
          <li key={index} className={styles.item}>
            <MagicTextRenderer text={text} />
          </li>
        ))}
      </ul>
    </div>
  );
}

UnorderedList.displayName = 'UnorderedList';

const exposedUnorderedList = exposeComponent(UnorderedList, {
  name: 'ul',
  description: 'Display a bulleted list of text items',
  props: {
    items: s.streaming.array(
      'The unordered list entries',
      s.streaming.string('The content of a single list entry'),
    ),
    citations: s.anyOf([
      s.streaming.array(
        'Citation references shared across the list',
        s.object('A citation reference', {
          id: s.number('The number of the citation'),
          url: s.string('The URL of the citation'),
        }),
      ),
      s.nullish(),
    ]),
  },
});

export default UnorderedList;
export { exposedUnorderedList };
