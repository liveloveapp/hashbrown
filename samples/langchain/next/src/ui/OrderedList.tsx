import { s } from '@hashbrownai/core';
import { exposeComponent } from '@hashbrownai/react';
import MagicTextRenderer from '../components/chat/MagicTextRenderer';
import styles from './OrderedList.module.css';

type OrderedListProps = {
  items: string[];
  citations: Array<{ id: number; url: string }> | null;
};

function OrderedList({ items }: OrderedListProps) {
  return (
    <div className={styles.wrapper}>
      <ol className={styles.list}>
        {items.map((text, index) => (
          <li key={index} className={styles.item}>
            <MagicTextRenderer text={text} />
          </li>
        ))}
      </ol>
    </div>
  );
}

OrderedList.displayName = 'OrderedList';

const exposedOrderedList = exposeComponent(OrderedList, {
  name: 'ol',
  description: 'Display a numbered list of text items',
  props: {
    items: s.streaming.array(
      'The ordered list entries',
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

export default OrderedList;
export { exposedOrderedList };
